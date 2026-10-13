import { expect, test } from 'vitest';
import type { FactSchema, Rule, Strategy } from '@repo/api-types';
import { checkScenarios, type Proposal } from './scenario-check';

const factSchema: FactSchema = [
  {
    key: 'daysSinceStart',
    type: 'number',
    values: null,
    unit: 'days',
    description: 'Days since the policy started',
    neutral: 0,
  },
  {
    key: 'claimIsForIllness',
    type: 'boolean',
    values: null,
    unit: null,
    description: 'The admission is for an illness',
    neutral: false,
  },
];

const rule = (id: string, kind: Rule['kind']) =>
  ({
    id,
    kind,
    summary: `Rule ${id}`,
    clauseIds: ['c-001'],
    when: { fact: 'daysSinceStart', op: 'gt', value: 1000 },
    effect: null,
    touches: [],
  }) as Rule;
const rules = [
  rule('r-001', 'benefit'),
  rule('r-002', 'exclusion'),
  rule('r-003', 'deadline'),
];

// Each call gives a scenario with facts of its own, so none is a duplicate.
let days = 0;
const proposal = (strategy: Strategy, change: object = {}) => ({
  strategy,
  entry: {
    story: 'You are admitted to hospital with dengue fever.',
    frequency: 'common',
    stake: 8000000,
    targetRuleIds: ['r-002'],
    facts: { daysSinceStart: (days += 1), claimIsForIllness: true },
    ...change,
  },
});
const check = (proposals: Proposal[], cap = 40) =>
  checkScenarios(proposals, rules, factSchema, cap);

test('a scenario that fits is kept and numbered by code', () => {
  const { scenarios, dropped } = check([
    proposal('overlap', { id: 'chosen-by-the-model' }),
    proposal('baseline'),
  ]);

  expect(scenarios.map(({ id, strategy }) => [id, strategy])).toEqual([
    ['s-001', 'baseline'],
    ['s-002', 'overlap'],
  ]);
  expect(dropped).toEqual([]);
});

test.each([
  ['a missing fact', { facts: { daysSinceStart: 5 } }],
  [
    'a fact the schema does not have',
    { facts: { daysSinceStart: 5, claimIsForIllness: true, mood: 'bad' } },
  ],
  [
    'a value of the wrong type',
    { facts: { daysSinceStart: 'five', claimIsForIllness: true } },
  ],
  ['a target that is not a rule', { targetRuleIds: ['r-099'] }],
  ['no story', { story: '  ' }],
  ['a story that is a page long', { story: 'x'.repeat(601) }],
  ['a frequency that does not exist', { frequency: 'weekly' }],
  ['a negative stake', { stake: -1 }],
])('a scenario with %s is dropped and the others are kept', (_, change) => {
  const { scenarios, dropped } = check([
    proposal('procedure'),
    proposal('procedure', change),
    proposal('procedure'),
  ]);

  expect(scenarios).toHaveLength(2);
  expect(dropped).toHaveLength(1);
});

test('an answer that is not a scenario at all is dropped', () => {
  const { scenarios, dropped } = check([
    { strategy: 'overlap', entry: null },
    { strategy: 'overlap', entry: 'a story' },
    proposal('overlap'),
  ]);

  expect(scenarios).toHaveLength(1);
  expect(dropped).toHaveLength(2);
});

test('two scenarios with the same facts are one, with the targets of both', () => {
  const facts = { daysSinceStart: 29, claimIsForIllness: true };
  const { scenarios } = check([
    proposal('combination', { facts, targetRuleIds: ['r-003', 'r-002'] }),
    proposal('boundary', { facts, story: 'From the boundary call.' }),
  ]);

  expect(scenarios).toHaveLength(1);
  expect(scenarios[0]).toMatchObject({
    strategy: 'boundary',
    story: 'From the boundary call.',
    targetRuleIds: ['r-002', 'r-003'],
  });
});

test('over the cap, the only scenario of a rule against the user stays', () => {
  const proposals = [
    ...Array.from({ length: 30 }, () => proposal('overlap')),
    ...Array.from({ length: 29 }, () => proposal('procedure')),
    // Last of all, and the only one that tries the deadline.
    proposal('combination', { targetRuleIds: ['r-003'] }),
  ];
  const { scenarios, uncovered } = check(proposals);

  expect(scenarios).toHaveLength(40);
  expect(scenarios.at(-1)!.targetRuleIds).toEqual(['r-003']);
  expect(uncovered).toEqual([]);
  expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(40);
});

test('over the cap, baseline scenarios stay and every strategy has a turn', () => {
  const strategies: Strategy[] = ['procedure', 'overlap', 'baseline'];
  const proposals = strategies.flatMap((strategy) =>
    Array.from({ length: 10 }, () => proposal(strategy)),
  );
  const { scenarios } = check(proposals, 12);
  const count = (strategy: Strategy) =>
    scenarios.filter((scenario) => scenario.strategy === strategy).length;

  expect(scenarios).toHaveLength(12);
  expect(count('baseline')).toBeGreaterThanOrEqual(4);
  expect(count('overlap')).toBeGreaterThanOrEqual(3);
  expect(count('procedure')).toBeGreaterThanOrEqual(2);
});

test('over the cap, the boundaries stay together', () => {
  const strategies: Strategy[] = ['procedure', 'overlap', 'boundary'];
  const proposals = strategies.flatMap((strategy) =>
    Array.from({ length: 15 }, () => proposal(strategy)),
  );
  const { scenarios } = check(proposals, 20);

  expect(
    scenarios.filter((scenario) => scenario.strategy === 'boundary'),
  ).toHaveLength(15);
});

test('a short list is kept as it is', () => {
  const proposals = Array.from({ length: 7 }, () => proposal('definition'));

  expect(check(proposals).scenarios).toHaveLength(7);
  expect(check([]).scenarios).toEqual([]);
});

test('a rule against the user that no scenario tries is named', () => {
  const { uncovered } = check([proposal('overlap'), proposal('baseline')]);

  // r-001 is a benefit; r-002 is the target of both.
  expect(uncovered).toEqual(['r-003']);
});
