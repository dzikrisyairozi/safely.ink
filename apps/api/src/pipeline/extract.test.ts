import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { AnalysisMeta, Clause, RuleDraft } from '@repo/api-types';
import { proposeRules, repairRules } from '../agents/rule-extractor';
import { rulesFor } from './extract';
import { BASE_FACTS } from './rule-check';

vi.mock('../agents/rule-extractor');
const propose = vi.mocked(proposeRules);
const repair = vi.mocked(repairRules);
const clauses: Clause[] = [
  {
    id: 'c',
    text: 'Late fee',
    number: '1',
    heading: null,
    gloss: null,
    page: 1,
  },
];
const meta: AnalysisMeta = {
  docType: 'loan',
  title: 'Loan',
  parties: [],
  userRole: 'Debitur',
  jurisdiction: 'ID',
  lawChecked: true,
  detected: { docType: 'loan', jurisdiction: 'ID' },
  language: 'id',
  pageCount: 1,
  unreadablePages: [],
};
const valid: RuleDraft = {
  kind: 'charge',
  summary: 'Late fee',
  clauseIds: ['c'],
  when: { fact: 'userPaidOnTime', op: 'eq', value: false },
  effect: { type: 'charge', amount: 100, percent: null },
  touches: ['userPaidOnTime'],
};
const invalid = {
  ...valid,
  when: { fact: 'unknown', op: 'eq', value: true },
  touches: ['unknown', 'userPaidOnTime'],
};
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

test('valid drafts retain numbered order without a repair', async () => {
  propose.mockResolvedValue([valid, { ...valid, summary: 'Second' }]);
  const result = await rulesFor(clauses, BASE_FACTS, meta);
  expect(result.rules.map((rule) => [rule.id, rule.summary])).toEqual([
    ['r-001', 'Late fee'],
    ['r-002', 'Second'],
  ]);
  expect(result.diagnostics).toEqual({ repairError: null, demoted: [] });
  expect(repair).not.toHaveBeenCalled();
});

test('repair uses the same IDs and sorts repaired and valid rules together', async () => {
  propose.mockResolvedValue([invalid, valid]);
  repair.mockResolvedValue([{ id: 'r-001', draft: valid }]);
  const result = await rulesFor(clauses, BASE_FACTS, meta);
  expect(result.rules.map((rule) => [rule.id, rule.kind])).toEqual([
    ['r-001', 'charge'],
    ['r-002', 'charge'],
  ]);
  expect(result.diagnostics).toEqual({ repairError: null, demoted: [] });
  expect(repair).toHaveBeenCalledTimes(1);
});

test('a repair failure logs the same error, falls back to the draft, and records diagnostics', async () => {
  const error = new Error('repair failed');
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  propose.mockResolvedValue([invalid, valid]);
  repair.mockRejectedValue(error);
  const result = await rulesFor(clauses, BASE_FACTS, meta);
  expect(logged).toHaveBeenCalledExactlyOnceWith(error);
  expect(result.diagnostics).toEqual({
    repairError: 'repair failed',
    demoted: ['r-001'],
  });
  expect(result.rules).toMatchObject([
    {
      id: 'r-001',
      kind: 'unmodeled',
      summary: 'Late fee',
      touches: ['userPaidOnTime'],
      when: null,
      effect: null,
    },
    { id: 'r-002', kind: 'charge' },
  ]);
});

test.each([
  { ...invalid, clauseIds: ['missing'] },
  { ...invalid, summary: '' },
])(
  'a worse repair falls back to demoting the original draft',
  async (answer) => {
    propose.mockResolvedValue([invalid]);
    repair.mockResolvedValue([{ id: 'r-001', draft: answer }]);
    const result = await rulesFor(clauses, BASE_FACTS, meta);
    expect(result.rules).toMatchObject([
      { id: 'r-001', kind: 'unmodeled', summary: 'Late fee', clauseIds: ['c'] },
    ]);
    expect(result.diagnostics.demoted).toEqual(['r-001']);
  },
);

test('an unanswered repair is demoted and a rule citing no real clause is dropped', async () => {
  propose.mockResolvedValue([invalid, { ...valid, clauseIds: ['missing'] }]);
  repair.mockResolvedValue([]);
  const result = await rulesFor(clauses, BASE_FACTS, meta);
  expect(result.rules).toHaveLength(1);
  expect(result.rules[0]!.kind).toBe('unmodeled');
  expect(result.diagnostics.demoted).toEqual(['r-001']);
});

test('no rules still throws and proposal failures still propagate', async () => {
  propose.mockResolvedValue([]);
  await expect(rulesFor(clauses, BASE_FACTS, meta)).rejects.toThrow(
    'The clauses gave no rule.',
  );
  propose.mockRejectedValue(new Error('proposal failed'));
  await expect(rulesFor(clauses, BASE_FACTS, meta)).rejects.toThrow(
    'proposal failed',
  );
});
