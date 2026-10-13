import { expect, test } from 'vitest';
import type { Condition, Fact, FactSchema, Rule } from '@repo/api-types';
import { holds } from '../engine/evaluate';
import { boundaryDrafts } from './boundary';

const number = (key: string, unit: string, neutral = 0): Fact => ({
  key,
  type: 'number',
  values: null,
  unit,
  description: `the ${key}`,
  neutral,
});
const factSchema: FactSchema = [
  number('daysSinceStart', 'days'),
  number('noticeDays', 'days'),
  number('roomCostPerDay', 'IDR'),
  {
    key: 'claimIsForIllness',
    type: 'boolean',
    values: null,
    unit: null,
    description: 'the admission is for an illness',
    neutral: false,
  },
  {
    key: 'activity',
    type: 'enum',
    values: ['none', 'scuba_diving', 'motor_racing'],
    unit: null,
    description: 'what you were doing',
    neutral: 'none',
  },
];

const rule = (id: string, when: Condition, kind: Rule['kind'] = 'exclusion') =>
  ({
    id,
    kind,
    summary: `Rule ${id}`,
    clauseIds: ['c-001'],
    when,
    effect: null,
    touches: [],
  }) as Rule;

const valuesOf = (key: string, rules: Rule[]) =>
  boundaryDrafts(rules, factSchema).map((draft) => draft.facts[key]);

test('a threshold gives the value before it, on it and after it', () => {
  const late = rule('r-001', { fact: 'noticeDays', op: 'gt', value: 7 });
  const drafts = boundaryDrafts([late], factSchema);

  expect(drafts.map((draft) => draft.facts.noticeDays)).toEqual([6, 7, 8]);
  expect(drafts.map((draft) => holds(late.when!, draft.facts))).toEqual([
    false,
    false,
    true,
  ]);
  expect(drafts[0]).toMatchObject({
    targetRuleIds: ['r-001'],
    facts: { daysSinceStart: 0, claimIsForIllness: false, activity: 'none' },
  });
});

test.each(['lt', 'lte', 'gt', 'gte'] as const)(
  'the rule changes sides around a "%s" threshold',
  (op) => {
    const when = { fact: 'daysSinceStart', op, value: 30 };
    const sides = boundaryDrafts([rule('r-001', when)], factSchema).map(
      (draft) => holds(when, draft.facts),
    );

    expect(new Set(sides).size).toBe(2);
  },
);

test('the other comparisons of an "all" group are made to hold', () => {
  const waiting = rule('r-001', {
    all: [
      { fact: 'claimIsForIllness', op: 'eq', value: true },
      { fact: 'activity', op: 'ne', value: 'none' },
      { fact: 'roomCostPerDay', op: 'gte', value: 500 },
      { fact: 'daysSinceStart', op: 'lt', value: 30 },
    ],
  });
  // The group has two thresholds; these are the three around the days.
  const forDays = boundaryDrafts([waiting], factSchema).filter((draft) =>
    draft.situation.startsWith('the daysSinceStart'),
  );

  expect(forDays.map((draft) => draft.facts.daysSinceStart)).toEqual([
    29, 30, 31,
  ]);
  expect(forDays.map((draft) => holds(waiting.when!, draft.facts))).toEqual([
    true,
    false,
    false,
  ]);
  // A fact the rule does not name stays as it is when nothing happened.
  expect(forDays[0]!.facts.noticeDays).toBe(0);
});

test('under "any" and "not" the other facts stay neutral', () => {
  const either = rule('r-001', {
    any: [
      { fact: 'claimIsForIllness', op: 'eq', value: true },
      { not: { fact: 'noticeDays', op: 'lte', value: 7 } },
    ],
  });
  const drafts = boundaryDrafts([either], factSchema);

  expect(drafts.map((draft) => draft.facts.noticeDays)).toEqual([6, 7, 8]);
  expect(drafts.every((draft) => draft.facts.claimIsForIllness === false)).toBe(
    true,
  );
});

test('a comparison that is not an ordering of a number gives nothing', () => {
  const rules = [
    rule('r-001', { fact: 'activity', op: 'in', value: ['scuba_diving'] }),
    rule('r-002', { fact: 'daysSinceStart', op: 'eq', value: 30 }),
    {
      ...rule('r-003', { fact: 'noticeDays', op: 'gt', value: 7 }),
      when: null,
    },
  ];

  expect(boundaryDrafts(rules as Rule[], factSchema)).toEqual([]);
});

test('a value below zero is left out for a fact that starts at zero', () => {
  const any = rule('r-001', { fact: 'noticeDays', op: 'gt', value: 0 });

  expect(valuesOf('noticeDays', [any])).toEqual([0, 1]);
});

test('at most five thresholds, rules against the user first', () => {
  const benefit = rule(
    'r-001',
    { fact: 'roomCostPerDay', op: 'gt', value: 100 },
    'benefit',
  );
  const against = [10, 20, 30, 40, 50].map((value, n) =>
    rule(`r-00${n + 2}`, { fact: 'daysSinceStart', op: 'lt', value }),
  );
  const drafts = boundaryDrafts([benefit, ...against], factSchema);

  expect(drafts).toHaveLength(15);
  expect(drafts.some((draft) => draft.targetRuleIds[0] === 'r-001')).toBe(
    false,
  );
});

test('a draft says in words what is different from an uneventful day', () => {
  const waiting = rule('r-001', {
    all: [
      { fact: 'claimIsForIllness', op: 'eq', value: true },
      { fact: 'daysSinceStart', op: 'lt', value: 30 },
    ],
  });

  expect(boundaryDrafts([waiting], factSchema)[0]!.situation).toBe(
    'the daysSinceStart: 29 days; the admission is for an illness: true',
  );
});

test('two siblings on one fact give that fact one value, in the facts and in words', () => {
  const window = rule('r-001', {
    all: [
      { fact: 'daysSinceStart', op: 'lt', value: 30 },
      { fact: 'noticeDays', op: 'gt', value: 30 },
      { fact: 'noticeDays', op: 'lte', value: 90 },
    ],
  });
  const [inside] = boundaryDrafts([window], factSchema).filter((draft) =>
    draft.situation.startsWith('the daysSinceStart'),
  );

  expect(inside!.situation).toBe(
    `the daysSinceStart: 29 days; the noticeDays: ${inside!.facts.noticeDays} days`,
  );
  expect(holds(window.when!, inside!.facts)).toBe(true);
});
