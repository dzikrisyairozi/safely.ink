import { randomUUID } from 'node:crypto';
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  AnalysisMeta,
  Clause,
  FactSchema,
  Rule,
  Scenario,
  StoredFinding,
  StoredScenario,
  isStalled,
  RUN_STALE_SECONDS,
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
import {
  rewriteTells,
  trapBriefs,
  worded,
  writeTraps,
} from './agents/trap-writer';
import { config } from './config';
import { evaluate } from './engine/evaluate';
import { score } from './engine/score';
import { validateScenarios } from './engine/validate';
import { db } from './firebase';
import { lookUpLaw } from './legal/research';
import { packFor } from './packs';
import { boundaryDrafts } from './pipeline/boundary';
import {
  checkFacts,
  checkRules,
  demote,
  numbered,
} from './pipeline/rule-check';
import { checkScenarios } from './pipeline/scenario-check';
import { slotIn } from './usage';
import { currentAttempt, inStage, log, type Usage } from './telemetry';
import { versions } from './versions';

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
    await fence(analysis);
    const batch = db.batch();
    for (const item of items.slice(from, from + BATCH)) {
      batch.set(analysis.collection(name).doc(item.id), item, { merge });
    }
    await batch.commit();
  }
}

const updatedAt = () => FieldValue.serverTimestamp();

/** Thrown into a stage whose attempt no longer holds the lease. */
export class LeaseLost extends Error {
  constructor() {
    super('Another attempt holds the lease of this stage.');
  }
}

/**
 * Throws LeaseLost when the attempt running this stage no longer holds its
 * lease, so an attempt that stalled past its lease cannot write over the one
 * that took over. A write that starts in the moment between the check and
 * the takeover still lands. Outside a leased stage it does nothing.
 */
export async function fence(analysis: DocumentReference) {
  const attemptId = currentAttempt();
  if (!attemptId) return;
  const lease = (await analysis.get()).data()?.lease;
  if (lease?.attemptId !== attemptId) throw new LeaseLost();
}

const stageUpdate = async (
  analysis: DocumentReference,
  fields: Record<string, unknown>,
) => {
  await fence(analysis);
  await analysis.update(fields);
};

// The model proposes facts and rules; rule-check.ts decides what is stored.
async function extractRules(analysis: DocumentReference, meta: AnalysisMeta) {
  const clauses = (await analysis.collection('clauses').get()).docs.map((doc) =>
    Clause.parse(doc.data()),
  );

  const factSchema = checkFacts(
    await proposeFacts(clauses, packFor(meta.docType), meta),
  );
  await stageUpdate(analysis, { factSchema, updatedAt: updatedAt() });

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
  await stageUpdate(analysis, {
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
  // time, within the limits of a call. The law is looked up after the judge.
  const {
    fuzz: least,
    fuzzMost: most,
    judge,
    wording,
    lawSearch,
    lawPage,
    lawAssess,
  } = config.limits.modelCallSeconds;
  // One lookup at its slowest: the search, a grounding redirect, our fetch
  // of a page, the model reading it instead, the assessment.
  const { pageSeconds } = config.limits.law;
  const law = meta.lawChecked
    ? lawSearch + 2 * pageSeconds + lawPage + lawAssess
    : 0;
  const left =
    Math.floor((deadline - Date.now()) / 1000) - judge - law - wording;
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
  // Ids only: the reasons quote fact values drawn from the user's document.
  if (dropped.length > 0) {
    const ids = dropped.map((reason) => reason.split(':')[0]);
    console.warn(`Scenarios dropped: ${ids.join(', ')}`);
  }
  if (uncovered.length > 0) {
    console.warn(`No scenario tries ${uncovered.join(', ')}.`);
  }
  if (scenarios.length === 0) throw new Error('The rules gave no scenario.');
  if (scenarios.length < SCENARIOS_AIMED_FOR) {
    console.warn(`Only ${scenarios.length} scenarios.`);
  }

  await saveAll(analysis, 'scenarios', scenarios);
  await stageUpdate(analysis, {
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
  await stageUpdate(analysis, {
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

// The model says what a person would expect, then the law is looked up;
// which gap is a trap, how bad it is and the grade are worked out by
// score() (F-TRAP-1 to F-TRAP-5). What an earlier attempt stored is kept: a
// retry judges only the scenarios without an expectation and looks up only
// the rules whose lookup was unavailable.
async function compare(
  analysis: DocumentReference,
  meta: AnalysisMeta,
  deadline: number,
) {
  const rules = await storedRules(analysis);
  const scenarios = (await analysis.collection('scenarios').get()).docs.map(
    (doc) => StoredScenario.parse(doc.data()),
  );
  const outcomes = scenarios.flatMap(({ outcome }) => outcome ?? []);
  const stored = Object.fromEntries(
    (await analysis.collection('findings').get()).docs.flatMap((doc) => {
      const parsed = StoredFinding.safeParse(doc.data());
      if (!parsed.success) return [];
      const { ruleId, ...finding } = parsed.data;
      return [[ruleId, finding]];
    }),
  );
  const pack = packFor(meta.docType);

  const expectations: Record<string, Expectation> = Object.fromEntries(
    scenarios.flatMap(({ id, expectation }) =>
      expectation ? [[id, expectation]] : [],
    ),
  );
  const unjudged = scenarios.filter(({ id }) => !expectations[id]);
  const batches: StoredScenario[][] = [];
  for (let from = 0; from < unjudged.length; from += JUDGED_AT_ONCE) {
    batches.push(unjudged.slice(from, from + JUDGED_AT_ONCE));
  }
  const { judge: judgeSeconds, wording } = config.limits.modelCallSeconds;
  const wordingAt = deadline - wording * 1000;
  const judgeAll = (all: StoredScenario[][]) =>
    Promise.allSettled(
      all.map((batch) =>
        judge(judgeInput(meta, pack, rules, batch), judgeSeconds),
      ),
    );
  // Keeps what the judge said about a batch; false when the batch was lost.
  const take = (
    batch: StoredScenario[],
    answer: PromiseSettledResult<unknown[]>,
  ) => {
    if (answer.status === 'rejected') {
      console.error(
        `The judge lost a batch of ${batch.length} scenarios:`,
        answer.reason,
      );
      return false;
    }
    const asked = new Set(batch.map((scenario) => scenario.id));
    for (const entry of answer.value) {
      const told = Judged.safeParse(entry);
      if (!told.success || !asked.has(told.data.id)) continue;
      const { id, ...expectation } = told.data;
      expectations[id] = expectation;
    }
    return true;
  };

  // The batches side by side, and one that fails does not cost the others;
  // a lost one is judged once more when there is time. The judge goes first,
  // even into the law's time: without an expectation nothing is a trap, and
  // the law gets what is left before the wording.
  const answers = await judgeAll(batches);
  const lost = batches.filter((batch, n) => !take(batch, answers[n]!));
  if (lost.length > 0 && wordingAt - Date.now() >= judgeSeconds * 1000) {
    const again = await judgeAll(lost);
    lost.forEach((batch, n) => take(batch, again[n]!));
  }

  // Only then the law, in time for the wording. Beside the lookup's searches
  // and readings, judge batches of 10 to 17 s did not answer in 90 s (eval of
  // 2026-10-14): every call slows down when many run at once.
  const findings = await lookUpLaw({
    rules,
    outcomes,
    stored,
    meta,
    deadline: wordingAt,
    save: async (ruleId, finding) => {
      await fence(analysis);
      await analysis
        .collection('findings')
        .doc(ruleId)
        .set({ ruleId, ...finding } satisfies StoredFinding);
    },
  });
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

  const { traps, points, grade, confidence, coverage } = score(
    {
      rules,
      scenarios,
      outcomes,
      expectations,
      findings,
      meta,
    },
    config.scoring,
  );
  await saveAll(analysis, 'traps', traps);
  await stageUpdate(analysis, {
    grade,
    points,
    // A scenario that was not judged cannot be a trap, so the grade may be
    // too good, and the analysis does not claim to be sure of it.
    confidence: missed > 0 && confidence === 'high' ? 'medium' : confidence,
    coverage,
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
  const { wording: wordingSeconds } = config.limits.modelCallSeconds;
  const first = await writeTraps(briefs, meta, wordingSeconds).catch((err) => {
    console.error(err);
    return [];
  });
  // One more call for words with a tell, if it can end in time; `worded`
  // drops what still has one.
  const words =
    Date.now() + wordingSeconds * 1000 <= deadline
      ? await rewriteTells(first, briefs, meta, wordingSeconds).catch((err) => {
          console.error(err);
          return first;
        })
      : first;
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
  // Fields of the analysis a screen shows as this stage's result.
  results?: string[];
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
  {
    status: 'comparing',
    run: compare,
    next: 'done',
    writes: 'traps',
    results: ['grade', 'points', 'confidence', 'counts.judged', 'counts.traps'],
  },
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
  const stage = STAGES.find((candidate) => candidate.status === status);
  if (stage?.writes)
    await db.recursiveDelete(analysis.collection(stage.writes));
  if (stage?.results) {
    await analysis.update(
      Object.fromEntries(
        stage.results.map((field) => [field, FieldValue.delete()]),
      ),
    );
  }
}

const increment = (n: number) => FieldValue.increment(n);

/**
 * Adds what one model call used, and its token cost, to the analysis. Model
 * IDs have dots, so the fields are named by FieldPath.
 */
export async function addUsage(
  analysis: DocumentReference,
  model: string,
  used: Usage,
) {
  const pairs = Object.entries(used).flatMap(([key, n]) => [
    new FieldPath('usage', model, key),
    increment(n),
  ]);
  const [field, value, ...more] = pairs as [FieldPath, unknown, ...unknown[]];
  await analysis.update(
    field,
    value,
    ...more,
    'tokenCostUsd',
    increment(used.usd),
  );
}

// What happened to a request to run the next stage.
export type StageResult =
  // The status the analysis is in now, and whether this call moved it there
  // by finishing a stage.
  | { status: AnalysisStatus; moved?: true }
  // Another attempt holds a lease that has not run out.
  | { busy: true }
  // The request is for another run of the analysis, or the analysis is gone.
  | { stale: true };

const lease = (attemptId: string) => ({
  attemptId,
  until: Timestamp.fromMillis(Date.now() + RUN_STALE_SECONDS * 1000),
});

const leaseHeld = (data: DocumentData) =>
  Boolean(data.lease) && data.lease.until.toMillis() > Date.now();

// The day the run's slot counts against. An analysis from before reservedAt
// existed has only createdAt.
const slotDay = (data: DocumentData): Date =>
  (data.reservedAt ?? data.createdAt).toDate();

/**
 * Ends the run as failed at `stage` in `tx`, and gives the day's slot back in
 * the same transaction (F-LIVE-4), so the two never come apart. Every read
 * of the transaction must be done before this is called.
 */
const failIn = (
  tx: Transaction,
  analysis: DocumentReference,
  slot: { release: () => void },
  stage: AnalysisStatus,
  error?: string,
) => {
  tx.update(analysis, {
    status: 'failed',
    stage,
    ...(error && { error }),
    cancelRequested: FieldValue.delete(),
    lease: FieldValue.delete(),
    updatedAt: updatedAt(),
  });
  slot.release();
};

/**
 * Runs the stage the analysis is in, once, under a lease (TSD 5). The lease
 * is claimed in a transaction and lasts RUN_STALE_SECONDS, longer than any
 * stage. A lease that ran out belongs to an attempt that died, so the stage
 * starts again without that attempt's output, and the stage's writes check
 * the lease (`fence`). The status moves on only while this attempt still
 * holds the lease, so a stage that finished never runs again. With `runId`,
 * a request for another run is stale, and with `expected`, a request for a
 * stage the run is past does nothing. A cancel the user asked for takes
 * effect here, between stages, once no attempt holds the lease. A failure to
 * store the outcome throws, so a queued task is tried again.
 */
export async function runStage(
  analysisId: string,
  {
    runId,
    expected,
    deadline = Date.now() + config.limits.confirmSeconds * 1000,
  }: {
    runId?: string;
    // The stage a task was made for. When the run is past it, nothing runs.
    expected?: AnalysisStatus;
    // When the request must be done, in ms since the epoch. A task has a
    // request of its own; the stages run here one after another share one.
    deadline?: number;
  } = {},
): Promise<StageResult> {
  const analysis = db.doc(`analyses/${analysisId}`);
  const attemptId = randomUUID();

  const claim = await db.runTransaction(async (tx) => {
    const data = (await tx.get(analysis)).data();
    if (!data || (runId && data.runId !== runId)) {
      return { kind: 'stale' as const };
    }
    const stage = STAGES.find(({ status }) => status === data.status);
    if (!stage || (expected && expected !== stage.status)) {
      return { kind: 'settled' as const, status: data.status };
    }
    if (leaseHeld(data)) return { kind: 'busy' as const };
    if (data.cancelRequested) {
      const slot = await slotIn(tx, data.ownerUid, slotDay(data));
      failIn(tx, analysis, slot, stage.status, 'cancelled');
      return { kind: 'settled' as const, status: 'failed' as const };
    }
    tx.update(analysis, { lease: lease(attemptId), updatedAt: updatedAt() });
    return {
      kind: 'claimed' as const,
      data,
      stage,
      recovered: Boolean(data.lease),
    };
  });
  if (claim.kind === 'stale') return { stale: true };
  if (claim.kind === 'busy') return { busy: true };
  if (claim.kind === 'settled') return { status: claim.status };

  const { data, stage, recovered } = claim;
  // Runs `write` only while this attempt still holds the lease; false once
  // it lost it.
  const finish = (
    write: (tx: Transaction, current: DocumentData) => Promise<void>,
  ) =>
    db.runTransaction(async (tx) => {
      const current = (await tx.get(analysis)).data();
      if (current?.lease?.attemptId !== attemptId) return false;
      await write(tx, current);
      return true;
    });

  const context = {
    analysisId,
    stage: stage.status,
    attemptId,
    save: (model: string, used: Usage) => addUsage(analysis, model, used),
  };
  try {
    await inStage(context, async () => {
      if (recovered) {
        log('WARNING', 'stage lease ran out, running the stage again');
        await clearStage(analysis, stage.status);
      }
      await stage.run(analysis, AnalysisMeta.parse(data.meta), deadline);
    });
  } catch (err) {
    if (err instanceof LeaseLost) return { busy: true };
    console.error(err);
    const failed = await finish(async (tx, current) => {
      const slot = await slotIn(tx, current.ownerUid, slotDay(current));
      failIn(tx, analysis, slot, stage.status);
    });
    return failed ? { status: 'failed' } : { busy: true };
  }

  const moved = await finish(async (tx) => {
    tx.update(analysis, {
      status: stage.next,
      [`versions.${stage.status}`]: versions,
      lease: FieldValue.delete(),
      updatedAt: updatedAt(),
    });
  });
  return moved ? { status: stage.next, moved: true } : { busy: true };
}

/**
 * Runs the stages from the current status of the analysis on, one after
 * another in this process. Where no task queue is set up (local and tests),
 * this is the run. Returns where the analysis ended.
 */
export async function runPipeline(analysisId: string): Promise<AnalysisStatus> {
  const deadline = Date.now() + config.limits.confirmSeconds * 1000;
  for (;;) {
    const result = await runStage(analysisId, { deadline });
    if ('status' in result && isStage(result.status)) continue;
    if ('status' in result) return result.status;
    const data = (await db.doc(`analyses/${analysisId}`).get()).data();
    return data?.status ?? 'failed';
  }
}

/**
 * Ends a run as failed at `stage`, with its slot given back, when its first
 * stage could not be queued: only while that run is still at that stage and
 * no attempt holds a lease, so a run that did start is left alone. True when
 * it ended the run.
 */
export function abandonRun(
  analysisId: string,
  runId: string,
  stage: AnalysisStatus,
) {
  const analysis = db.doc(`analyses/${analysisId}`);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(analysis)).data();
    if (!data || data.runId !== runId || data.status !== stage) return false;
    if (leaseHeld(data)) return false;
    const slot = await slotIn(tx, data.ownerUid, slotDay(data));
    failIn(tx, analysis, slot, stage);
    return true;
  });
}

/**
 * True for a run that stopped responding (`isStalled`) and that no attempt
 * holds a lease on. Its task may be gone for good (the queue gave up, or the
 * first one was never queued), so the user may retry it or stop it.
 */
export const stalledRun = (data: DocumentData) =>
  isStalled(data, Date.now()) && !leaseHeld(data);
