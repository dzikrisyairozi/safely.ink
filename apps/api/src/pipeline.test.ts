import { beforeEach, expect, test, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { FactSchema, Rule, StoredScenario, type Fact } from '@repo/api-types';
import proposedFacts from '../test/fixtures/rules-facts.json';
import proposedRules from '../test/fixtures/rules-rules.json';
import proposedScenarios from '../test/fixtures/fuzz-scenarios.json';
import {
  proposeFacts,
  proposeRules,
  repairRules,
} from './agents/rule-extractor';
import { judge, type JudgeInput } from './agents/expectation-judge';
import { proposeScenarios, tellBoundaries } from './agents/scenario-fuzzer';
import { config } from './config';
import { evaluate } from './engine/evaluate';
import { db } from './firebase';
import { runPipeline } from './pipeline';
import { BASE_FACTS } from './pipeline/rule-check';

// Run through `pnpm test`: Firestore is the emulator. Only the model is
// replaced.
vi.mock('./agents/rule-extractor');
vi.mock('./agents/scenario-fuzzer');
// The judge's input is built by the real code; only its call is replaced.
vi.mock('./agents/expectation-judge', async (original) => ({
  ...(await original<typeof import('./agents/expectation-judge')>()),
  judge: vi.fn(),
}));

const facts = vi.mocked(proposeFacts);
const rules = vi.mocked(proposeRules);
const repair = vi.mocked(repairRules);
const fuzzer = vi.mocked(proposeScenarios);
const boundaries = vi.mocked(tellBoundaries);
const judged = vi.mocked(judge);
// The judge expects every situation to end well unless a test says more.
const expectsFine = async ({ scenarios }: JudgeInput) =>
  scenarios.map(({ id }) => ({ id, result: 'fine', reason: 'It is covered.' }));
const [ordinary, earlyIllness, abroad] = proposedScenarios.scenarios;

const [benefit, exclusion] = proposedRules.rules;
const unknownFact = {
  ...exclusion,
  when: { fact: 'preExisting', op: 'eq', value: true },
  touches: ['preExisting', 'daysSinceStart'],
};

const analysis = db.doc('analyses/analysis-1');
const stored = async () => (await analysis.get()).data();
const storedRules = async () =>
  (await analysis.collection('rules').get()).docs.map((doc) => doc.data());
// The analysis was created the day before it is confirmed.
const startedOnCreationDay = async () =>
  (await db.doc('users/alice/usage/2026-10-12').get()).data()?.started;

beforeEach(async () => {
  await db.recursiveDelete(db.collection('analyses'));
  await db.recursiveDelete(db.collection('users'));
  vi.resetAllMocks();
  facts.mockResolvedValue(proposedFacts.facts as Fact[]);
  rules.mockResolvedValue(proposedRules.rules);
  // Every strategy tells the same ordinary situation unless a test says more.
  fuzzer.mockResolvedValue([ordinary]);
  boundaries.mockResolvedValue([]);
  judged.mockImplementation(expectsFine);

  await analysis.set({
    ownerUid: 'alice',
    status: 'extracting_rules',
    createdAt: Timestamp.fromDate(new Date('2026-10-12T23:50:00Z')),
    counts: { clauses: 3 },
    meta: {
      docType: 'insurance',
      title: 'Polis Asuransi Kesehatan',
      parties: [{ name: 'Budi Santoso', role: 'insured' }],
      userRole: 'insured',
      jurisdiction: 'ID',
      lawChecked: true,
      language: 'id',
      pageCount: 3,
      unreadablePages: [],
    },
  });
  for (const id of ['c-001', 'c-002', 'c-003']) {
    await analysis.collection('clauses').doc(id).set({
      id,
      number: null,
      heading: null,
      text: 'Wording of the clause.',
      gloss: null,
      page: 1,
    });
  }
  await db.doc('users/alice/usage/2026-10-12').set({ started: 1, attempts: 1 });
});

test('the facts and the rules are stored and the analysis moves on', async () => {
  expect(await runPipeline('analysis-1')).toBe('done');

  const doc = await stored();
  expect(doc).toMatchObject({
    status: 'done',
    counts: { clauses: 3, rules: 3 },
  });
  expect(doc?.factSchema).toHaveLength(BASE_FACTS.length + 3);
  expect((await storedRules()).map((rule) => [rule.id, rule.kind])).toEqual([
    ['r-001', 'benefit'],
    ['r-002', 'exclusion'],
    ['r-003', 'unmodeled'],
  ]);
  expect(repair).not.toHaveBeenCalled();
  expect(await startedOnCreationDay()).toBe(1);
});

test('the model is told the confirmed role and gets the pack of the type', async () => {
  await runPipeline('analysis-1');

  expect(facts).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ id: 'c-002' })]),
    expect.objectContaining({ facts: expect.any(Array) }),
    expect.objectContaining({ docType: 'insurance', userRole: 'insured' }),
  );
});

test('an invalid rule is repaired once, and what still does not fit is kept as unmodeled', async () => {
  const stillBroken = {
    ...unknownFact,
    summary: 'Old illnesses are not paid.',
  };
  rules.mockResolvedValue([benefit, unknownFact, stillBroken]);
  repair.mockResolvedValue([
    { id: 'r-002', draft: exclusion },
    { id: 'r-003', draft: stillBroken },
  ]);

  expect(await runPipeline('analysis-1')).toBe('done');

  const reasons = expect.arrayContaining([
    expect.stringMatching(/preExisting/),
  ]);
  expect(repair).toHaveBeenCalledTimes(1);
  expect(repair.mock.calls[0]![0]).toEqual([
    { id: 'r-002', draft: unknownFact, issues: reasons },
    { id: 'r-003', draft: stillBroken, issues: reasons },
  ]);
  expect(await storedRules()).toMatchObject([
    { id: 'r-001', kind: 'benefit' },
    { id: 'r-002', kind: 'exclusion', when: exclusion!.when },
    {
      id: 'r-003',
      kind: 'unmodeled',
      summary: 'Old illnesses are not paid.',
      clauseIds: ['c-002'],
      when: null,
      effect: null,
      touches: ['daysSinceStart'],
    },
  ]);
  expect((await stored())?.counts.rules).toBe(3);
});

test('a rule the repair does not answer for is kept as unmodeled', async () => {
  rules.mockResolvedValue([benefit, unknownFact]);
  repair.mockRejectedValue(new Error('model unavailable'));

  expect(await runPipeline('analysis-1')).toBe('done');

  expect(await storedRules()).toMatchObject([
    { id: 'r-001', kind: 'benefit' },
    { id: 'r-002', kind: 'unmodeled', summary: exclusion!.summary },
  ]);
});

test('a rule that cites no clause of the document is not stored', async () => {
  rules.mockResolvedValue([benefit, { ...exclusion, clauseIds: ['c-999'] }]);

  await runPipeline('analysis-1');

  expect((await storedRules()).map((rule) => rule.id)).toEqual(['r-001']);
  expect(repair).not.toHaveBeenCalled();
});

test('a failed stage is named and gives the slot of the creation day back', async () => {
  rules.mockRejectedValue(new Error('model unavailable'));

  expect(await runPipeline('analysis-1')).toBe('failed');

  expect(await stored()).toMatchObject({
    status: 'failed',
    stage: 'extracting_rules',
  });
  expect(await startedOnCreationDay()).toBe(0);
});

test('a document that gives no rule at all fails instead of moving on empty', async () => {
  rules.mockResolvedValue([]);

  expect(await runPipeline('analysis-1')).toBe('failed');

  expect(await stored()).toMatchObject({ stage: 'extracting_rules' });
});

test.each([
  {
    name: 'cites only a clause that does not exist',
    answer: { ...exclusion, clauseIds: ['c-999'] },
  },
  {
    name: 'still does not fit and cites only a clause that does not exist',
    answer: { ...unknownFact, clauseIds: ['c-999'] },
  },
  {
    name: 'still does not fit and has lost its summary',
    answer: { ...unknownFact, summary: '' },
  },
])(
  'a repair answer that $name leaves the rule as it was written, unmodeled',
  async ({ answer }) => {
    rules.mockResolvedValue([benefit, unknownFact]);
    repair.mockResolvedValue([{ id: 'r-002', draft: answer }]);

    expect(await runPipeline('analysis-1')).toBe('done');

    expect(await storedRules()).toMatchObject([
      { id: 'r-001', kind: 'benefit' },
      {
        id: 'r-002',
        kind: 'unmodeled',
        summary: exclusion!.summary,
        clauseIds: ['c-002'],
      },
    ]);
  },
);

test('the slot is given back for the day it was taken, not the day of creation', async () => {
  // Reserved just before midnight UTC, created just after.
  await analysis.update({
    reservedAt: Timestamp.fromDate(new Date('2026-10-11T23:59:59Z')),
  });
  await db.doc('users/alice/usage/2026-10-11').set({ started: 1, attempts: 1 });
  rules.mockRejectedValue(new Error('model unavailable'));

  await runPipeline('analysis-1');

  const started = async (day: string) =>
    (await db.doc(`users/alice/usage/${day}`).get()).data()?.started;
  expect(await started('2026-10-11')).toBe(0);
  expect(await started('2026-10-12')).toBe(1);
});

// From here on the analysis has its rules, and scenarios wait to be run.
const factSchema = [...BASE_FACTS, ...(proposedFacts.facts as Fact[])];
const uneventful = Object.fromEntries(
  factSchema.map((fact) => [fact.key, fact.neutral]),
);
const scenario = (id: string, targetRuleId: string, facts: object) => ({
  id,
  story: 'You are admitted to hospital for four days.',
  strategy: 'overlap',
  frequency: 'common',
  targetRuleIds: [targetRuleId],
  stake: 5_000_000,
  facts: { ...uneventful, inpatientCost: 5_000_000, ...facts },
});
const waiting = [
  scenario('s-001', 'r-001', { daysSinceStart: 200 }),
  scenario('s-002', 'r-002', { claimIsForIllness: true, daysSinceStart: 10 }),
  scenario('s-003', 'r-003', { treatmentPlace: 'abroad' }),
];
const storedScenarios = async () =>
  (await analysis.collection('scenarios').get()).docs.map((doc) =>
    StoredScenario.parse(doc.data()),
  );

async function readyToRun(
  scenarios: ({ id: string } & Record<string, unknown>)[],
) {
  await analysis.update({ status: 'running', factSchema });
  for (const [n, rule] of proposedRules.rules.entries()) {
    const id = `r-00${n + 1}`;
    await analysis
      .collection('rules')
      .doc(id)
      .set({ ...rule, id });
  }
  for (const item of scenarios) {
    await analysis.collection('scenarios').doc(item.id).set(item);
  }
}

test('every scenario is run by code and gets one outcome with its trace', async () => {
  await readyToRun(waiting);

  expect(await runPipeline('analysis-1')).toBe('done');

  expect(
    (await storedScenarios()).map(({ id, outcome }) => [
      id,
      outcome?.result,
      outcome?.decidingRuleId,
      outcome?.loss,
    ]),
  ).toEqual([
    ['s-001', 'fine', null, 0],
    ['s-002', 'bad', 'r-002', 5_000_000],
    ['s-003', 'undetermined', 'r-003', 0],
  ]);
  expect((await storedScenarios())[1]!.outcome!.trace).toContainEqual(
    expect.objectContaining({ ruleId: 'r-002' }),
  );
  expect(await stored()).toMatchObject({
    status: 'done',
    counts: { clauses: 3, fine: 1, partlyBad: 0, bad: 1, undetermined: 1 },
  });
  expect(facts).not.toHaveBeenCalled();
});

test('running the stored rules and scenarios again gives the same outcomes', async () => {
  await readyToRun(waiting);
  await runPipeline('analysis-1');

  const again = (await analysis.collection('rules').get()).docs.map((doc) =>
    Rule.parse(doc.data()),
  );
  const schema = FactSchema.parse((await stored())!.factSchema);

  for (const { outcome, ...ran } of await storedScenarios()) {
    expect(evaluate(again, schema, ran)).toEqual(outcome);
  }
});

test('the run adds the outcome and leaves the rest of a scenario as it was', async () => {
  const kept = { addedBy: 'a later stage' };
  await readyToRun([{ ...waiting[0]!, ...kept }]);

  await runPipeline('analysis-1');

  const doc = await analysis.collection('scenarios').doc('s-001').get();
  expect(doc.data()).toMatchObject({
    ...kept,
    story: waiting[0]!.story,
    outcome: { result: 'fine' },
  });
});

test('a stored scenario that does not fit the facts fails the run, by name', async () => {
  await readyToRun([{ ...waiting[0]!, facts: { inpatientCost: 5_000_000 } }]);

  expect(await runPipeline('analysis-1')).toBe('failed');

  expect(await stored()).toMatchObject({ status: 'failed', stage: 'running' });
  expect(await startedOnCreationDay()).toBe(0);
});

test('scenarios of every strategy are checked, stored and run in one go', async () => {
  fuzzer.mockImplementation(async (strategy) =>
    strategy === 'baseline' ? [ordinary] : [earlyIllness, abroad, 'no story'],
  );
  boundaries.mockImplementation(async (drafts) =>
    drafts.map(({ facts, targetRuleIds }) => ({
      story: 'You are admitted with a fever.',
      frequency: 'common',
      stake: 1_000_000,
      facts,
      targetRuleIds,
    })),
  );

  expect(await runPipeline('analysis-1')).toBe('done');

  // The waiting period of r-002 gives three boundaries and the cost of r-001
  // two, since a cost below zero is left out. The same facts told by four
  // strategies are one scenario.
  expect(
    (await storedScenarios()).map(({ id, strategy, outcome }) => [
      id,
      strategy,
      outcome?.result,
    ]),
  ).toEqual([
    ['s-001', 'baseline', 'fine'],
    ['s-002', 'boundary', 'bad'],
    ['s-003', 'boundary', 'fine'],
    ['s-004', 'boundary', 'fine'],
    ['s-005', 'boundary', 'bad'],
    ['s-006', 'boundary', 'fine'],
    ['s-007', 'overlap', 'bad'],
    ['s-008', 'overlap', 'undetermined'],
  ]);
  expect((await stored())!.counts).toEqual({
    clauses: 3,
    rules: 3,
    scenarios: 8,
    traps: 2,
    fine: 4,
    partlyBad: 0,
    bad: 3,
    undetermined: 1,
  });
});

test('the fuzzer is told the rules as stored, the facts, the seeds and the role', async () => {
  await runPipeline('analysis-1');

  expect(fuzzer).toHaveBeenCalledTimes(5);
  expect(fuzzer).toHaveBeenCalledWith(
    'procedure',
    expect.arrayContaining([expect.objectContaining({ id: 'r-002' })]),
    expect.arrayContaining([expect.objectContaining({ key: 'inpatientCost' })]),
    expect.objectContaining({ seeds: expect.any(Object) }),
    expect.objectContaining({ userRole: 'insured' }),
    config.limits.modelCallSeconds.fuzzMost,
  );
});

// The clock is moved while the rule writer works; Firestore runs as usual.
test.each([
  [0, 240],
  [550, 150],
  [650, 90],
])(
  'when the rules took %i s, a fuzzer call may take %i s',
  async (used, seconds) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    rules.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + used * 1000);
      return proposedRules.rules;
    });

    try {
      await runPipeline('analysis-1');
    } finally {
      vi.useRealTimers();
    }

    expect(fuzzer.mock.calls[0]![5]).toBe(seconds);
    expect(boundaries.mock.calls[0]![2]).toBe(seconds);
  },
);

test('one call of the fuzzer that fails does not cost the others', async () => {
  fuzzer.mockImplementation(async (strategy) => {
    if (strategy === 'overlap') throw new Error('model unavailable');
    return [earlyIllness];
  });
  boundaries.mockRejectedValue(new Error('model unavailable'));

  expect(await runPipeline('analysis-1')).toBe('done');

  expect(await stored()).toMatchObject({ counts: { scenarios: 1, bad: 1 } });
});

test('with no scenario that fits, the run fails at the fuzzing and the slot is given back', async () => {
  fuzzer.mockResolvedValue([{ ...ordinary, facts: { daysSinceStart: 5 } }]);

  expect(await runPipeline('analysis-1')).toBe('failed');

  expect(await stored()).toMatchObject({ status: 'failed', stage: 'fuzzing' });
  expect(await storedScenarios()).toEqual([]);
  expect(await startedOnCreationDay()).toBe(0);
});

// From here on the scenarios were run and wait to be compared.
const traps = async () =>
  (await analysis.collection('traps').get()).docs.map((doc) => doc.data());

test('an outcome worse than expected becomes a trap, and the analysis is done with a grade', async () => {
  await readyToRun(waiting);

  expect(await runPipeline('analysis-1')).toBe('done');

  expect(
    (await storedScenarios()).map(({ expectation }) => expectation),
  ).toEqual(Array(3).fill({ result: 'fine', reason: 'It is covered.' }));
  // s-002 loses the whole stake and is common: 3 + 2 points, a high trap.
  expect(await traps()).toEqual([
    {
      id: 'trap-r-002',
      ruleId: 'r-002',
      scenarioIds: ['s-002'],
      severity: 'high',
      title: null,
      action: null,
    },
  ]);
  expect(await stored()).toMatchObject({
    status: 'done',
    grade: 'A',
    confidence: 'low',
    counts: { traps: 1, bad: 1 },
  });
  expect(judged).toHaveBeenCalledWith(
    expect.objectContaining({ userRole: 'insured' }),
    config.limits.modelCallSeconds.judge,
  );
});

test('the grade can be worked out again from the stored traps', async () => {
  await readyToRun(waiting);
  await runPipeline('analysis-1');

  const { penalty, gradeBands } = config.scoring;
  const points = (await traps()).reduce(
    (left, trap) => left - penalty[trap.severity as keyof typeof penalty],
    100,
  );

  expect(points).toBe(90);
  expect((await stored())!.grade).toBe(
    gradeBands.find((band) => points >= band.from)!.value,
  );
});

test('a scenario the rules cannot decide lowers the confidence and not the grade', async () => {
  await readyToRun(waiting.slice(0, 2));
  await runPipeline('analysis-1');
  const clear = await stored();

  await analysis.update({ status: 'running' });
  await readyToRun(waiting);
  await runPipeline('analysis-1');
  const unclear = await stored();

  expect([clear!.grade, clear!.confidence]).toEqual(['A', 'high']);
  expect([unclear!.grade, unclear!.confidence]).toEqual(['A', 'low']);
});

test('an outcome that is what the user expected is no trap', async () => {
  judged.mockImplementation(async ({ scenarios }) =>
    scenarios.map(({ id }) => ({ id, result: 'bad', reason: 'Too early.' })),
  );
  await readyToRun(waiting);

  expect(await runPipeline('analysis-1')).toBe('done');

  expect(await traps()).toEqual([]);
  expect(await stored()).toMatchObject({ grade: 'A', counts: { traps: 0 } });
});

test('one batch of the judge that fails does not cost the other', async () => {
  // 21 scenarios are two batches; the first is lost.
  const many = Array.from({ length: 21 }, (_, n) => ({
    ...waiting[1]!,
    id: `s-${String(n + 1).padStart(3, '0')}`,
  }));
  judged.mockRejectedValueOnce(new Error('model unavailable'));
  await readyToRun(many);

  expect(await runPipeline('analysis-1')).toBe('done');

  expect(judged).toHaveBeenCalledTimes(2);
  expect(
    (await storedScenarios()).filter(({ expectation }) => expectation),
  ).toHaveLength(1);
  expect(await traps()).toMatchObject([{ scenarioIds: ['s-021'] }]);
});

test.each([
  ['fails', () => judged.mockRejectedValue(new Error('model unavailable'))],
  [
    'answers for a scenario it was not asked about',
    () =>
      judged.mockResolvedValue([{ id: 's-999', result: 'fine', reason: '-' }]),
  ],
  [
    'gives an answer that is none of the three',
    () =>
      judged.mockResolvedValue([{ id: 's-002', result: 'great', reason: '-' }]),
  ],
])(
  'when the judge %s, the run fails at the comparing and the slot is given back',
  async (_, answer) => {
    answer();
    await readyToRun(waiting);

    expect(await runPipeline('analysis-1')).toBe('failed');

    expect(await stored()).toMatchObject({
      status: 'failed',
      stage: 'comparing',
    });
    expect(await traps()).toEqual([]);
    expect(await startedOnCreationDay()).toBe(0);
  },
);
