import { beforeEach, expect, test, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { Fact } from '@repo/api-types';
import proposedFacts from '../test/fixtures/rules-facts.json';
import proposedRules from '../test/fixtures/rules-rules.json';
import {
  proposeFacts,
  proposeRules,
  repairRules,
} from './agents/rule-extractor';
import { db } from './firebase';
import { runPipeline } from './pipeline';
import { BASE_FACTS } from './pipeline/rule-check';

// Run through `pnpm test`: Firestore is the emulator. Only the model is
// replaced.
vi.mock('./agents/rule-extractor');

const facts = vi.mocked(proposeFacts);
const rules = vi.mocked(proposeRules);
const repair = vi.mocked(repairRules);

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
  expect(await runPipeline('analysis-1')).toBe('fuzzing');

  const doc = await stored();
  expect(doc).toMatchObject({
    status: 'fuzzing',
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

  expect(await runPipeline('analysis-1')).toBe('fuzzing');

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

  expect(await runPipeline('analysis-1')).toBe('fuzzing');

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
