import { expect, test } from 'vitest';
import type {
  Expectation,
  LegalFinding,
  Outcome,
  Scenario,
} from '@repo/api-types';
import { score, type ScoreInput, type ScoreWeights } from './score';

// The numbers of TSD 5.7.
const weights: ScoreWeights = {
  lossBands: [
    { from: 0.8, value: 3 },
    { from: 0.3, value: 2 },
    { from: 0, value: 1 },
  ],
  lossWithoutStake: 3,
  frequency: { common: 2, occasional: 1, rare: 0 },
  law: { conflicts: 3, restricted: 2, permitted: 0, no_finding: 0 },
  severityBands: [
    { from: 6, value: 'critical' },
    { from: 4, value: 'high' },
    { from: 2, value: 'medium' },
    { from: 0, value: 'low' },
  ],
  penalty: { critical: 20, high: 10, medium: 5, low: 2 },
  gradeBands: [
    { from: 90, value: 'A' },
    { from: 75, value: 'B' },
    { from: 60, value: 'C' },
    { from: 40, value: 'D' },
    { from: 0, value: 'F' },
  ],
  undeterminedShare: { high: 0.1, medium: 0.25 },
};

type Case = {
  rule: string;
  result?: Outcome['result'];
  stake?: number | null;
  loss?: number;
  frequency?: Scenario['frequency'];
  expected?: Expectation['result'];
  law?: LegalFinding['status'];
};

const citation = {
  instrument: 'Insurance Act 1966',
  section: 's 25(5)',
  quote: 'An insurer may not rely on the term.',
  url: 'https://example.com/insurance-act',
};

// One scenario per case, numbered s-1, s-2, … in order.
function input(cases: Case[], meta: Partial<ScoreInput['meta']> = {}) {
  const built: ScoreInput = {
    scenarios: [],
    outcomes: [],
    expectations: {},
    findings: {},
    meta: { docType: 'insurance', unreadablePages: [], ...meta },
  };

  cases.forEach((c, index) => {
    const id = `s-${index + 1}`;
    const result = c.result ?? 'bad';
    const stake = c.stake === undefined ? 1000 : c.stake;

    built.scenarios.push({
      id,
      story: '',
      strategy: 'boundary',
      frequency: c.frequency ?? 'rare',
      targetRuleIds: [],
      stake,
      facts: {},
    });
    built.outcomes.push({
      scenarioId: id,
      result,
      stake,
      loss: c.loss ?? (result === 'bad' ? (stake ?? 0) : 0),
      decidingRuleId: result === 'fine' ? null : c.rule,
      trace: [],
    });
    if (c.expected) {
      built.expectations[id] = { result: c.expected, reason: '' };
    }
    if (c.law) {
      built.findings[c.rule] = {
        status: c.law,
        reasoning: '',
        citations: c.law === 'no_finding' ? [] : [citation],
        error: null,
      };
    }
  });
  return built;
}

// Cases that each produce one trap of a known severity, on their own rule.
const low = (rule: string): Case => ({
  rule,
  result: 'partly_bad',
  loss: 100,
  expected: 'fine',
});
const medium = (rule: string): Case => ({
  ...low(rule),
  frequency: 'occasional',
});
const high = (rule: string): Case => ({
  rule,
  frequency: 'occasional',
  expected: 'fine',
});
const critical = (rule: string): Case => ({
  rule,
  frequency: 'common',
  expected: 'fine',
  law: 'conflicts',
});

test('an outcome worse than expected is a trap that waits for its wording', () => {
  const { traps } = score(input([{ rule: 'r-1', expected: 'fine' }]), weights);

  expect(traps).toEqual([
    {
      id: 'trap-r-1',
      ruleId: 'r-1',
      scenarioIds: ['s-1'],
      severity: 'medium',
      title: null,
      action: null,
    },
  ]);
});

test.each<Case & { trap: boolean }>([
  { rule: 'r', result: 'bad', expected: 'fine', trap: true },
  { rule: 'r', result: 'bad', expected: 'partly_bad', trap: true },
  { rule: 'r', result: 'bad', expected: 'bad', trap: false },
  { rule: 'r', result: 'partly_bad', loss: 100, expected: 'fine', trap: true },
  {
    rule: 'r',
    result: 'partly_bad',
    loss: 100,
    expected: 'partly_bad',
    trap: false,
  },
  { rule: 'r', result: 'partly_bad', loss: 100, expected: 'bad', trap: false },
  { rule: 'r', result: 'bad', trap: false },
  { rule: 'r', result: 'bad', expected: 'bad', law: 'conflicts', trap: true },
  { rule: 'r', result: 'bad', expected: 'bad', law: 'restricted', trap: true },
  { rule: 'r', result: 'bad', expected: 'bad', law: 'permitted', trap: false },
  { rule: 'r', result: 'bad', expected: 'bad', law: 'no_finding', trap: false },
  {
    rule: 'r',
    result: 'undetermined',
    expected: 'fine',
    law: 'conflicts',
    trap: false,
  },
  { rule: 'r', result: 'fine', expected: 'fine', trap: false },
])(
  'outcome $result, expected $expected, law $law: trap $trap',
  ({ trap, ...c }) => {
    expect(score(input([c]), weights).traps).toHaveLength(trap ? 1 : 0);
  },
);

test('scenarios decided by the same rule merge into one trap', () => {
  const { traps } = score(
    input([
      { rule: 'r-1', expected: 'fine' },
      { rule: 'r-2', expected: 'fine' },
      { rule: 'r-1', expected: 'fine' },
    ]),
    weights,
  );

  expect(traps.map((trap) => [trap.ruleId, trap.scenarioIds])).toEqual([
    ['r-1', ['s-1', 's-3']],
    ['r-2', ['s-2']],
  ]);
});

test.each<Case & { name: string; severity: string }>([
  {
    name: '29% lost, rare',
    rule: 'r',
    result: 'partly_bad',
    loss: 290,
    severity: 'low',
  },
  {
    name: '30% lost, rare',
    rule: 'r',
    result: 'partly_bad',
    loss: 300,
    severity: 'medium',
  },
  {
    name: '79% lost, occasional',
    rule: 'r',
    result: 'partly_bad',
    loss: 790,
    frequency: 'occasional',
    severity: 'medium',
  },
  {
    name: '80% lost, occasional',
    rule: 'r',
    result: 'partly_bad',
    loss: 800,
    frequency: 'occasional',
    severity: 'high',
  },
  {
    name: 'all lost, common',
    rule: 'r',
    frequency: 'common',
    severity: 'high',
  },
  {
    name: 'all lost, common, restricted by law',
    rule: 'r',
    frequency: 'common',
    law: 'restricted',
    severity: 'critical',
  },
  {
    name: 'all lost, rare, against the law',
    rule: 'r',
    law: 'conflicts',
    severity: 'critical',
  },
  {
    name: '10% lost, rare, restricted by law',
    rule: 'r',
    result: 'partly_bad',
    loss: 100,
    law: 'restricted',
    severity: 'medium',
  },
  { name: 'no stake, rare', rule: 'r', stake: null, severity: 'medium' },
  {
    name: 'no stake, a charge, occasional',
    rule: 'r',
    stake: null,
    loss: 50,
    frequency: 'occasional',
    severity: 'high',
  },
])('severity: $name is $severity', ({ name: _name, severity, ...c }) => {
  const { traps } = score(input([{ expected: 'fine', ...c }]), weights);

  expect(traps[0]?.severity).toBe(severity);
});

test('a merged trap takes the worst loss and the most common example', () => {
  const { traps } = score(
    input([
      { rule: 'r-1', expected: 'fine', frequency: 'rare' },
      {
        rule: 'r-1',
        result: 'partly_bad',
        loss: 100,
        expected: 'fine',
        frequency: 'common',
      },
    ]),
    weights,
  );

  expect(traps).toMatchObject([{ severity: 'high' }]);
});

test('traps come out most severe first, then in order of appearance', () => {
  const { traps } = score(
    input([
      low('r-low'),
      high('r-high-1'),
      critical('r-crit'),
      high('r-high-2'),
    ]),
    weights,
  );

  expect(traps.map((trap) => trap.ruleId)).toEqual([
    'r-crit',
    'r-high-1',
    'r-high-2',
    'r-low',
  ]);
});

const many = (make: (rule: string) => Case, count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => make(`${prefix}-${i}`));

test.each<{ cases: Case[]; points: number; grade: string }>([
  { cases: [], points: 100, grade: 'A' },
  { cases: [high('h')], points: 90, grade: 'A' },
  { cases: [high('h'), low('l')], points: 88, grade: 'B' },
  { cases: [critical('c'), medium('m')], points: 75, grade: 'B' },
  { cases: [critical('c'), medium('m'), low('l')], points: 73, grade: 'C' },
  { cases: many(critical, 2, 'c'), points: 60, grade: 'C' },
  { cases: [...many(critical, 2, 'c'), low('l')], points: 58, grade: 'D' },
  { cases: many(critical, 3, 'c'), points: 40, grade: 'D' },
  { cases: [...many(critical, 3, 'c'), low('l')], points: 38, grade: 'F' },
  { cases: many(critical, 6, 'c'), points: -20, grade: 'F' },
])('grade: $points points is $grade', ({ cases, points, grade }) => {
  expect(score(input(cases), weights)).toMatchObject({ points, grade });
});

const unclear = (count: number, of: number): Case[] =>
  Array.from({ length: of }, (_, i) => ({
    rule: 'r',
    result: i < count ? 'undetermined' : 'fine',
  }));

test.each<{
  name: string;
  cases: Case[];
  meta?: Partial<ScoreInput['meta']>;
  confidence: string;
}>([
  { name: 'nothing tested', cases: [], confidence: 'high' },
  { name: '1 of 11 unclear', cases: unclear(1, 11), confidence: 'high' },
  { name: '1 of 10 unclear', cases: unclear(1, 10), confidence: 'medium' },
  { name: '6 of 25 unclear', cases: unclear(6, 25), confidence: 'medium' },
  { name: '1 of 4 unclear', cases: unclear(1, 4), confidence: 'low' },
  {
    name: 'nothing unclear but a page unreadable',
    cases: unclear(0, 10),
    meta: { unreadablePages: [3] },
    confidence: 'medium',
  },
  {
    name: 'nothing unclear on the general pack',
    cases: unclear(0, 10),
    meta: { docType: 'other' },
    confidence: 'medium',
  },
  {
    name: 'mostly unclear on the general pack',
    cases: unclear(3, 10),
    meta: { docType: 'other' },
    confidence: 'low',
  },
])('confidence: $name is $confidence', ({ cases, meta, confidence }) => {
  expect(score(input(cases, meta), weights).confidence).toBe(confidence);
});

test('unclear scenarios lower confidence, not the grade', () => {
  const result = score(input(unclear(5, 10)), weights);

  expect(result).toMatchObject({ points: 100, grade: 'A', confidence: 'low' });
});

test('the numbers come from the weights', () => {
  const harsher = {
    ...weights,
    penalty: { ...weights.penalty, high: 30 },
  };

  expect(score(input([high('h')]), harsher)).toMatchObject({
    points: 70,
    grade: 'C',
  });
});

test('the same input gives the same result', () => {
  const cases = [critical('c'), low('l'), high('h'), ...unclear(1, 2)];

  expect(score(input(cases), weights)).toEqual(score(input(cases), weights));
});
