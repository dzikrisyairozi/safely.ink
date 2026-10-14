import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import {
  AnalysisMeta,
  Clause,
  FactSchema,
  Rule,
  Scenario,
  StoredScenario,
  WrittenStrategy,
  type AnalysisStatus,
  type Expectation,
  type Outcome,
} from '@repo/api-types';
import {
  proposeFacts,
  proposeRules,
  repairRules,
} from './agents/rule-extractor';
import { Judged, judge, judgeInput } from './agents/expectation-judge';
import { proposeScenarios, tellBoundaries } from './agents/scenario-fuzzer';
import { trapBriefs, worded, writeTraps } from './agents/trap-writer';
import { config } from './config';
import { evaluate } from './engine/evaluate';
import { score } from './engine/score';
import { validateScenarios } from './engine/validate';
import { db } from './firebase';
import { packFor } from './packs';
import { boundaryDrafts } from './pipeline/boundary';
import {
  checkFacts,
  checkRules,
  demote,
  numbered,
} from './pipeline/rule-check';
import { checkScenarios } from './pipeline/scenario-check';
import { releaseDailySlot } from './usage';

const BATCH = 500; // Firestore's limit of writes in one batch

/**
 * Stores each item in a sub-collection of the analysis, under its ID. With
 * `merge`, fields of a stored document that the item does not have stay.
 */
export async function saveAll(
  analysis: DocumentReference,
  name: string,
  items: { id: string }[],
  merge = false,
) {
  for (let from = 0; from < items.length; from += BATCH) {
    const batch = db.batch();
    for (const item of items.slice(from, from + BATCH)) {
      batch.set(analysis.collection(name).doc(item.id), item, { merge });
    }
    await batch.commit();
  }
}

const updatedAt = () => FieldValue.serverTimestamp();

// The model proposes facts and rules; rule-check.ts decides what is stored.
async function extractRules(analysis: DocumentReference, meta: AnalysisMeta) {
  const clauses = (await analysis.collection('clauses').get()).docs.map((doc) =>
    Clause.parse(doc.data()),
  );

  const factSchema = checkFacts(
    await proposeFacts(clauses, packFor(meta.docType), meta),
  );
  await analysis.update({ factSchema, updatedAt: updatedAt() });

  const drafts = numbered(await proposeRules(clauses, factSchema, meta));
  const first = checkRules(drafts, clauses, factSchema);
  const rules = first.valid;

  if (first.invalid.length > 0) {
    // One repair. A rule it does not answer for is checked again as it was.
    const answers = await repairRules(
      first.invalid,
      clauses,
      factSchema,
      meta,
    ).catch((err) => {
      console.error(err);
      return [];
    });
    const again = first.invalid.map(({ id, draft }) => ({
      id,
      draft: answers.find((answer) => answer.id === id)?.draft ?? draft,
    }));
    const repaired = checkRules(again, clauses, factSchema).valid;
    rules.push(...repaired);

    // What the repair did not fix is kept as unmodeled. The answer can be
    // worse than the rule it was meant to correct, so the rule as it was
    // first written is the fallback.
    for (const [n, original] of first.invalid.entries()) {
      if (repaired.some((rule) => rule.id === original.id)) continue;
      const kept =
        demote(again[n]!, clauses, factSchema) ??
        demote(original, clauses, factSchema);
      if (kept) rules.push(kept);
    }
    rules.sort((a, b) => a.id.localeCompare(b.id));
  }
  if (rules.length === 0) throw new Error('The clauses gave no rule.');

  await saveAll(analysis, 'rules', rules);
  await analysis.update({
    'counts.rules': rules.length,
    updatedAt: updatedAt(),
  });
}

// Rules in the order of their IDs, which is the order evaluate() decides in.
const storedRules = async (analysis: DocumentReference) =>
  (await analysis.collection('rules').get()).docs.map((doc) =>
    Rule.parse(doc.data()),
  );

// What the prompts aim for (F-FUZZ-1). A short document can give fewer.
const SCENARIOS_AIMED_FOR = 20;

// The model proposes situations; scenario-check.ts decides which are
// stored. The facts of a boundary scenario are set by code.
async function fuzz(
  analysis: DocumentReference,
  meta: AnalysisMeta,
  deadline: number,
) {
  const rules = await storedRules(analysis);
  const factSchema = FactSchema.parse(
    (await analysis.get()).data()!.factSchema,
  );
  const pack = packFor(meta.docType);
  // What the earlier calls left of the request once the comparing has its
  // time, within the limits of a call.
  const {
    fuzz: least,
    fuzzMost: most,
    judge,
    wording,
  } = config.limits.modelCallSeconds;
  const left = Math.floor((deadline - Date.now()) / 1000) - judge - wording;
  const seconds = Math.min(most, Math.max(least, left));

  // Side by side, and one call that fails does not cost the others.
  const calls = [
    ...WrittenStrategy.options.map((strategy) => ({
      strategy,
      entries: proposeScenarios(
        strategy,
        rules,
        factSchema,
        pack,
        meta,
        seconds,
      ),
    })),
    {
      strategy: 'boundary' as const,
      entries: tellBoundaries(boundaryDrafts(rules, factSchema), meta, seconds),
    },
  ];
  const answers = await Promise.allSettled(calls.map((call) => call.entries));
  const proposals = answers.flatMap((answer, n) => {
    const { strategy } = calls[n]!;
    if (answer.status === 'rejected') {
      console.error(answer.reason);
      return [];
    }
    return answer.value.map((entry) => ({ strategy, entry }));
  });

  const { scenarios, dropped, uncovered } = checkScenarios(
    proposals,
    rules,
    factSchema,
    config.limits.scenariosPerAnalysis,
  );
  if (dropped.length > 0) console.warn('Scenarios dropped:', dropped);
  if (uncovered.length > 0) {
    console.warn(`No scenario tries ${uncovered.join(', ')}.`);
  }
  if (scenarios.length === 0) throw new Error('The rules gave no scenario.');
  if (scenarios.length < SCENARIOS_AIMED_FOR) {
    console.warn(`Only ${scenarios.length} scenarios.`);
  }

  await saveAll(analysis, 'scenarios', scenarios);
  await analysis.update({
    'counts.scenarios': scenarios.length,
    updatedAt: updatedAt(),
  });
}

// The outcome of every scenario is decided here, by code (F-RUN-2). It works
// from what is stored, so running it again on the same analysis gives the
// same result.
async function runScenarios(analysis: DocumentReference) {
  const rules = await storedRules(analysis);
  const factSchema = FactSchema.parse(
    (await analysis.get()).data()!.factSchema,
  );
  const scenarios = (await analysis.collection('scenarios').get()).docs.map(
    (doc) => Scenario.parse(doc.data()),
  );
  const [issue] = validateScenarios(scenarios, rules, factSchema);
  if (issue) throw new Error(`Scenario ${issue.id}: ${issue.message}`);

  // Only the outcome is written: what a later stage adds to a scenario is
  // not this stage's to replace.
  const ran = scenarios.map((scenario) => ({
    id: scenario.id,
    outcome: evaluate(rules, factSchema, scenario),
  }));
  await saveAll(analysis, 'scenarios', ran, true);

  const count = (result: Outcome['result']) =>
    ran.filter(({ outcome }) => outcome.result === result).length;
  await analysis.update({
    'counts.fine': count('fine'),
    'counts.partlyBad': count('partly_bad'),
    'counts.bad': count('bad'),
    'counts.undetermined': count('undetermined'),
    updatedAt: updatedAt(),
  });
}

// Scenarios in one call of the judge. With 20, one of two calls did not answer
// in its 90 s on the demo policy (2026-10-13); another time it took 29 s.
// All batches run at once, so a higher scenariosPerAnalysis means more calls
// side by side, up to the rate limit of the model.
const JUDGED_AT_ONCE = 10;

// The model says what a person would expect; which gap is a trap, how bad it
// is and the grade are worked out by score() (F-TRAP-1 to F-TRAP-5). The
// law is not looked up yet, so no finding reaches it.
async function compare(analysis: DocumentReference, meta: AnalysisMeta) {
  const rules = await storedRules(analysis);
  const scenarios = (await analysis.collection('scenarios').get()).docs.map(
    (doc) => StoredScenario.parse(doc.data()),
  );
  const pack = packFor(meta.docType);

  const batches: StoredScenario[][] = [];
  for (let from = 0; from < scenarios.length; from += JUDGED_AT_ONCE) {
    batches.push(scenarios.slice(from, from + JUDGED_AT_ONCE));
  }
  // Side by side, and one batch that fails does not cost the others.
  const answers = await Promise.allSettled(
    batches.map((batch) =>
      judge(
        judgeInput(meta, pack, rules, batch),
        config.limits.modelCallSeconds.judge,
      ),
    ),
  );

  const expectations: Record<string, Expectation> = {};
  for (const [n, answer] of answers.entries()) {
    if (answer.status === 'rejected') {
      console.error(answer.reason);
      continue;
    }
    const asked = new Set(batches[n]!.map((scenario) => scenario.id));
    for (const entry of answer.value) {
      const told = Judged.safeParse(entry);
      if (!told.success || !asked.has(told.data.id)) continue;
      const { id, ...expectation } = told.data;
      expectations[id] = expectation;
    }
  }
  const judged = Object.entries(expectations);
  // Without an expectation nothing can be a trap, and a report that found
  // none would say the document is fine.
  if (judged.length === 0) throw new Error('No scenario was judged.');
  const missed = scenarios.length - judged.length;
  if (missed > 0) console.warn(`${missed} scenarios not judged.`);
  await saveAll(
    analysis,
    'scenarios',
    judged.map(([id, expectation]) => ({ id, expectation })),
    true,
  );

  const { traps, points, grade, confidence } = score(
    {
      scenarios,
      outcomes: scenarios.flatMap(({ outcome }) => outcome ?? []),
      expectations,
      findings: {},
      meta,
    },
    config.scoring,
  );
  await saveAll(analysis, 'traps', traps);
  await analysis.update({
    grade,
    points,
    // A scenario that was not judged cannot be a trap, so the grade may be
    // too good, and the analysis does not claim to be sure of it.
    confidence: missed > 0 && confidence === 'high' ? 'medium' : confidence,
    'counts.judged': judged.length,
    'counts.traps': traps.length,
    updatedAt: updatedAt(),
  });
  if (traps.length === 0) return;

  // The traps are complete without their words (TSD 5.7), so a model that
  // fails here costs the title and the questions, not the analysis.
  const briefs = trapBriefs(
    traps,
    rules,
    scenarios.map((scenario) => ({
      ...scenario,
      expectation: expectations[scenario.id],
    })),
  );
  const words = await writeTraps(
    briefs,
    meta,
    config.limits.modelCallSeconds.wording,
  ).catch((err) => {
    console.error(err);
    return [];
  });
  await saveAll(analysis, 'traps', worded(traps, words, briefs));
}

type Stage = {
  status: AnalysisStatus;
  run: (
    analysis: DocumentReference,
    meta: AnalysisMeta,
    // When the request must be done, in ms since the epoch.
    deadline: number,
  ) => Promise<void>;
  // The status when the stage is done.
  next: AnalysisStatus;
  // The sub-collection the stage writes from scratch. Running scenarios only
  // adds their outcomes, which a second run writes over.
  writes: string | null;
};

// In the order they run.
const STAGES: Stage[] = [
  {
    status: 'extracting_rules',
    run: extractRules,
    next: 'fuzzing',
    writes: 'rules',
  },
  { status: 'fuzzing', run: fuzz, next: 'running', writes: 'scenarios' },
  { status: 'running', run: runScenarios, next: 'comparing', writes: null },
  { status: 'comparing', run: compare, next: 'done', writes: 'traps' },
];

/** True for a status that is a stage a failed run can resume from. */
export const isStage = (status: unknown): status is AnalysisStatus =>
  STAGES.some((stage) => stage.status === status);

/**
 * Deletes what a stage wrote in an attempt that failed, so that running it
 * again leaves nothing of that attempt behind.
 */
export async function clearStage(
  analysis: DocumentReference,
  status: AnalysisStatus,
) {
  const writes = STAGES.find((stage) => stage.status === status)?.writes;
  if (writes) await db.recursiveDelete(analysis.collection(writes));
}

/**
 * Runs the stages from the current status of the analysis on, and writes
 * the status after each. Returns where the analysis ended.
 */
export async function runPipeline(analysisId: string): Promise<AnalysisStatus> {
  const analysis = db.doc(`analyses/${analysisId}`);
  const data = (await analysis.get()).data()!;
  let status: AnalysisStatus = data.status;
  const deadline = Date.now() + config.limits.confirmSeconds * 1000;

  for (const stage of STAGES) {
    if (stage.status !== status) continue;
    try {
      await stage.run(analysis, AnalysisMeta.parse(data.meta), deadline);
      status = stage.next;
      await analysis.update({ status, updatedAt: updatedAt() });
    } catch (err) {
      console.error(err);
      await analysis
        .update({
          status: 'failed',
          stage: stage.status,
          updatedAt: updatedAt(),
        })
        .catch(console.error);
      // A failed run does not count against the day its slot was taken on
      // (F-LIVE-4), also when the status itself could not be stored. An
      // analysis from before reservedAt existed has only createdAt.
      const reserved = data.reservedAt ?? data.createdAt;
      await releaseDailySlot(data.ownerUid, reserved.toDate());
      return 'failed';
    }
  }
  return status;
}
