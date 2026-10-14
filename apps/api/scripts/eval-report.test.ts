import { expect, test } from 'vitest';
import type { Analysis, Clause, Rule, Trap } from '@repo/api-types';
import { evalReport } from './eval-report';

const clause: Clause = {
  id: 'c-001',
  number: '4.2',
  heading: 'Waiting period',
  text: 'No benefit is paid for an illness in the first 30 days.',
  gloss: null,
  page: 3,
};

const rule: Rule = {
  id: 'r-001',
  kind: 'exclusion',
  summary: 'No cover for an illness in the first 30 days',
  clauseIds: ['c-001'],
  when: { fact: 'daysSinceStart', op: 'lt', value: 30 },
  effect: { type: 'deny', amount: null, percent: null },
  touches: ['daysSinceStart'],
};

const trap: Trap = {
  id: 'trap-r-001',
  ruleId: 'r-001',
  scenarioIds: ['s-003', 's-007'],
  severity: 'high',
  title: 'An illness in the first month is not paid',
  action: null,
};

const done: Analysis = {
  ownerUid: 'owner',
  status: 'done',
  meta: null,
  counts: { clauses: 1, rules: 1, scenarios: 24, traps: 1 },
  grade: 'B',
  confidence: 'high',
};

const input = {
  analysisId: 'eval-1',
  file: 'policy.pdf',
  analysis: done,
  clauses: [clause],
  rules: [rule],
  traps: [trap],
  times: [
    { status: 'reading', at: 0 },
    { status: 'awaiting_confirmation', at: 20_000 },
    { status: 'extracting_rules', at: 21_000 },
    { status: 'fuzzing', at: 51_000 },
    { status: 'done', at: 101_000 },
  ],
} as const;

test('a finished run reports the seconds each stage took and in total', () => {
  const report = evalReport(input);

  expect(report.seconds).toEqual({
    reading: 20,
    awaiting_confirmation: 1,
    extracting_rules: 30,
    fuzzing: 50,
  });
  expect(report.totalSeconds).toBe(101);
  expect(report).toMatchObject({
    status: 'done',
    failedStage: null,
    grade: 'B',
    confidence: 'high',
    counts: { rules: 1, scenarios: 24, traps: 1 },
  });
});

test('a failed run names the stage it stopped in', () => {
  const report = evalReport({
    ...input,
    analysis: { ...done, status: 'failed', stage: 'fuzzing' },
  });

  expect(report.status).toBe('failed');
  expect(report.failedStage).toBe('fuzzing');
});

test('each rule and trap carries the clause text a reviewer checks it against', () => {
  const report = evalReport(input);

  expect(report.rules).toEqual([
    {
      id: 'r-001',
      kind: 'exclusion',
      summary: rule.summary,
      clauses: [{ id: 'c-001', number: '4.2', page: 3, text: clause.text }],
    },
  ]);
  expect(report.traps).toEqual([
    {
      id: 'trap-r-001',
      severity: 'high',
      title: trap.title,
      rule: rule.summary,
      scenarios: 2,
      clauses: [{ id: 'c-001', number: '4.2', page: 3, text: clause.text }],
    },
  ]);
});

test('a clause the rule names but the document lacks shows as missing', () => {
  const report = evalReport({
    ...input,
    rules: [{ ...rule, clauseIds: ['c-001', 'c-999'] }],
  });

  expect(report.rules[0]?.clauses).toEqual([
    { id: 'c-001', number: '4.2', page: 3, text: clause.text },
    { id: 'c-999', number: null, page: null, text: null },
  ]);
});
