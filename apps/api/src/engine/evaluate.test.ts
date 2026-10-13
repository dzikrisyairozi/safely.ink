import { expect, test } from 'vitest';
import type { Condition, FactSchema, Rule, Scenario } from '@repo/api-types';
import { evaluate } from './evaluate';

const schema: FactSchema = [
  {
    key: 'daysSinceStart',
    type: 'number',
    values: null,
    unit: 'days',
    description: 'Days since the cover started',
    neutral: 365,
  },
  {
    key: 'userPaidOnTime',
    type: 'boolean',
    values: null,
    unit: null,
    description: 'Every premium was paid by its due date',
    neutral: true,
  },
  {
    key: 'cause',
    type: 'enum',
    values: ['fire', 'flood', 'riot'],
    unit: null,
    description: 'What caused the damage',
    neutral: 'fire',
  },
];

const neutralFacts = Object.fromEntries(schema.map((f) => [f.key, f.neutral]));

const always: Condition = { all: [] };
const never: Condition = { any: [] };
const early: Condition = { fact: 'daysSinceStart', op: 'lt', value: 30 };
const unpaid: Condition = { fact: 'userPaidOnTime', op: 'eq', value: false };

function rule(
  kind: Rule['kind'],
  when: Condition | null,
  extra: Partial<Rule> = {},
): Rule {
  return {
    id: kind,
    kind,
    summary: kind,
    clauseIds: ['c-1'],
    when,
    effect: null,
    touches: [],
    ...extra,
  };
}

function scenario(extra: Partial<Scenario> = {}): Scenario {
  return {
    id: 's-1',
    story: 'A kitchen fire a year into the policy.',
    strategy: 'baseline',
    frequency: 'common',
    targetRuleIds: [],
    stake: 1000,
    facts: neutralFacts,
    ...extra,
  };
}

test.each<{ name: string; when: Condition; fires: boolean }>([
  {
    name: 'eq on a number',
    when: { fact: 'daysSinceStart', op: 'eq', value: 365 },
    fires: true,
  },
  {
    name: 'ne on a number',
    when: { fact: 'daysSinceStart', op: 'ne', value: 365 },
    fires: false,
  },
  {
    name: 'lt just above',
    when: { fact: 'daysSinceStart', op: 'lt', value: 366 },
    fires: true,
  },
  {
    name: 'lt at the value',
    when: { fact: 'daysSinceStart', op: 'lt', value: 365 },
    fires: false,
  },
  {
    name: 'lte at the value',
    when: { fact: 'daysSinceStart', op: 'lte', value: 365 },
    fires: true,
  },
  {
    name: 'gt at the value',
    when: { fact: 'daysSinceStart', op: 'gt', value: 365 },
    fires: false,
  },
  {
    name: 'gt just below',
    when: { fact: 'daysSinceStart', op: 'gt', value: 364 },
    fires: true,
  },
  {
    name: 'gte at the value',
    when: { fact: 'daysSinceStart', op: 'gte', value: 365 },
    fires: true,
  },
  {
    name: 'eq on a boolean',
    when: { fact: 'userPaidOnTime', op: 'eq', value: true },
    fires: true,
  },
  {
    name: 'ne on a boolean',
    when: { fact: 'userPaidOnTime', op: 'ne', value: true },
    fires: false,
  },
  {
    name: 'eq on an enum',
    when: { fact: 'cause', op: 'eq', value: 'fire' },
    fires: true,
  },
  {
    name: 'in with the value listed',
    when: { fact: 'cause', op: 'in', value: ['fire', 'riot'] },
    fires: true,
  },
  {
    name: 'in without the value',
    when: { fact: 'cause', op: 'in', value: ['flood', 'riot'] },
    fires: false,
  },
  { name: 'all of nothing', when: { all: [] }, fires: true },
  { name: 'any of nothing', when: { any: [] }, fires: false },
  { name: 'all with one false', when: { all: [always, early] }, fires: false },
  { name: 'any with one true', when: { any: [early, always] }, fires: true },
  { name: 'not', when: { not: early }, fires: true },
  {
    name: 'nested',
    when: { all: [{ not: unpaid }, { any: [early, { not: never }] }] },
    fires: true,
  },
])('condition: $name', ({ when, fires }) => {
  const outcome = evaluate([rule('exclusion', when)], schema, scenario());

  expect(outcome.result).toBe(fires ? 'bad' : 'fine');
});

test('a fact the scenario does not have stops the run', () => {
  const when: Condition = { fact: 'claimAmount', op: 'gt', value: 0 };

  expect(() => evaluate([rule('exclusion', when)], schema, scenario())).toThrow(
    /claimAmount/,
  );
});

test('ordering a fact that is not a number stops the run', () => {
  const when: Condition = { fact: 'cause', op: 'lt', value: 3 };

  expect(() => evaluate([rule('exclusion', when)], schema, scenario())).toThrow(
    /cause/,
  );
});

test('with nothing against the user the outcome is fine and has no deciding rule', () => {
  const rules = [rule('benefit', always), rule('exclusion', early)];

  const outcome = evaluate(rules, schema, scenario());

  expect(outcome).toEqual({
    scenarioId: 's-1',
    result: 'fine',
    stake: 1000,
    loss: 0,
    decidingRuleId: null,
    trace: [{ ruleId: 'benefit', fact: null, note: 'Benefit applies' }],
  });
});

test('a targeted benefit that does not apply loses the whole stake', () => {
  const rules = [rule('benefit', early)];

  const outcome = evaluate(
    rules,
    schema,
    scenario({ targetRuleIds: ['benefit'] }),
  );

  expect(outcome).toMatchObject({
    result: 'bad',
    loss: 1000,
    decidingRuleId: 'benefit',
    trace: [{ ruleId: 'benefit', fact: 'daysSinceStart' }],
  });
});

test('any benefit that applies satisfies the benefit stage', () => {
  const rules = [
    rule('benefit', early, { id: 'b-early' }),
    rule('benefit', always, { id: 'b-always' }),
  ];

  const outcome = evaluate(
    rules,
    schema,
    scenario({ targetRuleIds: ['b-early'] }),
  );

  expect(outcome.result).toBe('fine');
});

test('the benefit stage is skipped when the scenario targets no benefit', () => {
  const rules = [rule('benefit', early), rule('exclusion', early)];

  const outcome = evaluate(
    rules,
    schema,
    scenario({ targetRuleIds: ['exclusion'] }),
  );

  expect(outcome.result).toBe('fine');
});

test.each(['condition', 'deadline', 'exclusion'] as const)(
  'a %s that fires is bad and decides',
  (kind) => {
    const facts = { ...neutralFacts, userPaidOnTime: false };

    const outcome = evaluate([rule(kind, unpaid)], schema, scenario({ facts }));

    expect(outcome).toMatchObject({
      result: 'bad',
      loss: 1000,
      decidingRuleId: kind,
      trace: [{ ruleId: kind, fact: 'userPaidOnTime' }],
    });
  },
);

test('a bad outcome with no stake loses nothing in money', () => {
  const outcome = evaluate(
    [rule('exclusion', always)],
    schema,
    scenario({ stake: null }),
  );

  expect(outcome).toMatchObject({ result: 'bad', stake: null, loss: 0 });
});

test('every rule that fires in the deciding stage is traced, the first decides', () => {
  const rules = [
    rule('deadline', always, { id: 'd-1' }),
    rule('condition', never, { id: 'c-quiet' }),
    rule('condition', always, { id: 'c-2' }),
  ];

  const outcome = evaluate(rules, schema, scenario());

  expect(outcome.decidingRuleId).toBe('d-1');
  expect(outcome.trace.map((step) => step.ruleId)).toEqual(['d-1', 'c-2']);
});

test('a failed condition beats an exclusion listed before it', () => {
  const rules = [rule('exclusion', always), rule('condition', always)];

  const outcome = evaluate(rules, schema, scenario());

  expect(outcome.decidingRuleId).toBe('condition');
  expect(outcome.trace.map((step) => step.ruleId)).toEqual(['condition']);
});

test('an exclusion beats an unmodeled rule', () => {
  const rules = [
    rule('unmodeled', null, { touches: ['cause'] }),
    rule('exclusion', always),
  ];
  const facts = { ...neutralFacts, cause: 'flood' };

  const outcome = evaluate(rules, schema, scenario({ facts }));

  expect(outcome).toMatchObject({ result: 'bad', decidingRuleId: 'exclusion' });
});

test('an unmodeled rule whose fact is off neutral leaves the outcome undetermined', () => {
  const rules = [
    rule('unmodeled', null, { touches: ['daysSinceStart', 'cause'] }),
  ];
  const facts = { ...neutralFacts, cause: 'flood' };

  const outcome = evaluate(rules, schema, scenario({ facts }));

  expect(outcome).toMatchObject({
    result: 'undetermined',
    loss: 0,
    decidingRuleId: 'unmodeled',
    trace: [{ ruleId: 'unmodeled', fact: 'cause' }],
  });
});

test('an unmodeled rule whose facts are all neutral changes nothing', () => {
  const rules = [rule('unmodeled', null, { touches: ['cause'] })];

  const outcome = evaluate(rules, schema, scenario());

  expect(outcome).toMatchObject({ result: 'fine', decidingRuleId: null });
});
