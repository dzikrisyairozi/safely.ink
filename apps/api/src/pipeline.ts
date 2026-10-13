import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import {
  AnalysisMeta,
  Clause,
  FactSchema,
  Rule,
  Scenario,
  Strategy,
  type AnalysisStatus,
} from '@repo/api-types';
import {
  proposeFacts,
  proposeRules,
  repairRules,
} from './agents/rule-extractor';
import { proposeScenarios, tellBoundaries } from './agents/scenario-fuzzer';
import { config } from './config';
import { evaluate } from './engine/evaluate';
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

/** Stores each item in a sub-collection of the analysis, under its ID. */
export async function saveAll(
  analysis: DocumentReference,
  name: string,
  items: { id: string }[],
) {
  for (let from = 0; from < items.length; from += BATCH) {
    const batch = db.batch();
    for (const item of items.slice(from, from + BATCH)) {
      batch.set(analysis.collection(name).doc(item.id), item);
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

const WRITTEN = Strategy.exclude(['boundary']).options;
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
  // What the earlier calls left of the request, within the limits of a call.
  const { fuzz: least, fuzzMost: most } = config.limits.modelCallSeconds;
  const seconds = Math.min(
    most,
    Math.max(least, Math.floor((deadline - Date.now()) / 1000)),
  );

  // Side by side, and one call that fails does not cost the others.
  const calls = [
    ...WRITTEN.map((strategy) => ({
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

  const ran = scenarios.map((scenario) => ({
    ...scenario,
    outcome: evaluate(rules, factSchema, scenario),
  }));
  await saveAll(analysis, 'scenarios', ran);

  const count = (result: (typeof ran)[number]['outcome']['result']) =>
    ran.filter(({ outcome }) => outcome.result === result).length;
  await analysis.update({
    'counts.fine': count('fine'),
    'counts.partlyBad': count('partly_bad'),
    'counts.bad': count('bad'),
    'counts.undetermined': count('undetermined'),
    updatedAt: updatedAt(),
  });
}

type Stage = {
  status: AnalysisStatus;
  run: (
    analysis: DocumentReference,
    meta: AnalysisMeta,
    // When the request must be done, in ms since the epoch.
    deadline: number,
  ) => Promise<void>;
  // The status when the stage is done: the next stage, or where the
  // analysis waits for a stage that is not built yet.
  next: AnalysisStatus;
};

// In the order they run.
const STAGES: Stage[] = [
  { status: 'extracting_rules', run: extractRules, next: 'fuzzing' },
  { status: 'fuzzing', run: fuzz, next: 'running' },
  { status: 'running', run: runScenarios, next: 'comparing' },
];

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
