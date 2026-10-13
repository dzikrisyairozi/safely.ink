import { expect, test } from 'vitest';
import type { Clause, Fact, FactSchema, Rule, Scenario } from '@repo/api-types';
import {
  validateFactSchema,
  validateRules,
  validateScenarios,
} from './validate';

const days: Fact = {
  key: 'daysSinceStart',
  type: 'number',
  values: null,
  unit: 'days',
  description: 'Days since the cover started',
  neutral: 365,
};
const paid: Fact = {
  key: 'userPaidOnTime',
  type: 'boolean',
  values: null,
  unit: null,
  description: 'Every premium was paid by its due date',
  neutral: true,
};
const cause: Fact = {
  key: 'cause',
  type: 'enum',
  values: ['fire', 'flood', 'riot'],
  unit: null,
  description: 'What caused the damage',
  neutral: 'fire',
};
const schema: FactSchema = [days, paid, cause];

const clauses: Clause[] = [
  {
    id: 'c-1',
    number: '4.1',
    heading: null,
    text: 'No cover in the first 30 days.',
    gloss: null,
    page: 2,
  },
];

function rule(extra: Partial<Rule> = {}): Rule {
  return {
    id: 'r-1',
    kind: 'exclusion',
    summary: 'No cover in the first 30 days',
    clauseIds: ['c-1'],
    when: { fact: 'daysSinceStart', op: 'lt', value: 30 },
    effect: null,
    touches: ['daysSinceStart'],
    ...extra,
  };
}

function scenario(extra: Partial<Scenario> = {}): Scenario {
  return {
    id: 's-1',
    story: 'A kitchen fire a year into the policy.',
    strategy: 'baseline',
    frequency: 'common',
    targetRuleIds: ['r-1'],
    stake: 1000,
    facts: { daysSinceStart: 365, userPaidOnTime: true, cause: 'fire' },
    ...extra,
  };
}

test('a consistent schema, rule and scenario raise nothing', () => {
  const rules = [
    rule(),
    rule({
      id: 'r-2',
      when: {
        all: [
          { fact: 'cause', op: 'in', value: ['flood', 'riot'] },
          { not: { fact: 'userPaidOnTime', op: 'eq', value: false } },
          { any: [{ fact: 'cause', op: 'ne', value: 'fire' }] },
        ],
      },
    }),
    rule({
      id: 'r-3',
      kind: 'limit',
      effect: { type: 'cap', amount: null, percent: 50 },
    }),
    rule({ id: 'r-4', kind: 'unmodeled', when: null, touches: ['cause'] }),
  ];

  expect(validateFactSchema(schema)).toEqual([]);
  expect(validateRules(rules, clauses, schema)).toEqual([]);
  expect(validateScenarios([scenario()], rules, schema)).toEqual([]);
});

test.each<{ name: string; schema: FactSchema; id: string; message: RegExp }>([
  {
    name: 'a key used twice',
    schema: [days, { ...paid, key: 'daysSinceStart' }],
    id: 'daysSinceStart',
    message: /more than once/,
  },
  {
    name: 'an enum with no values',
    schema: [{ ...cause, values: null }],
    id: 'cause',
    message: /values/,
  },
  {
    name: 'a neutral value of the wrong type',
    schema: [{ ...days, neutral: 'never' }],
    id: 'daysSinceStart',
    message: /neutral/,
  },
  {
    name: 'a neutral value outside the enum',
    schema: [{ ...cause, neutral: 'theft' }],
    id: 'cause',
    message: /neutral/,
  },
])('fact schema: $name', ({ schema, id, message }) => {
  expect(validateFactSchema(schema)).toEqual([
    { id, message: expect.stringMatching(message) },
  ]);
});

test.each<{ name: string; rule: Rule; message: RegExp }>([
  {
    name: 'a clause that does not exist',
    rule: rule({ clauseIds: ['c-1', 'c-99'] }),
    message: /c-99/,
  },
  {
    name: 'a fact outside the schema',
    rule: rule({ when: { fact: 'claimAmount', op: 'gt', value: 0 } }),
    message: /claimAmount/,
  },
  {
    name: 'a number compared with text',
    rule: rule({ when: { fact: 'daysSinceStart', op: 'eq', value: 'soon' } }),
    message: /daysSinceStart/,
  },
  {
    name: 'a boolean compared with a number',
    rule: rule({ when: { fact: 'userPaidOnTime', op: 'eq', value: 1 } }),
    message: /userPaidOnTime/,
  },
  {
    name: 'a boolean put in order',
    rule: rule({ when: { fact: 'userPaidOnTime', op: 'gt', value: false } }),
    message: /userPaidOnTime/,
  },
  {
    name: 'an enum compared with a value it does not have',
    rule: rule({ when: { fact: 'cause', op: 'eq', value: 'theft' } }),
    message: /cause/,
  },
  {
    name: '"in" on a number',
    rule: rule({ when: { fact: 'daysSinceStart', op: 'in', value: ['30'] } }),
    message: /daysSinceStart/,
  },
  {
    name: '"in" with a value the enum does not have',
    rule: rule({ when: { fact: 'cause', op: 'in', value: ['fire', 'theft'] } }),
    message: /cause/,
  },
  {
    name: 'a bad comparison deep inside a condition',
    rule: rule({
      when: {
        all: [{ any: [{ not: { fact: 'ghost', op: 'eq', value: true } }] }],
      },
    }),
    message: /ghost/,
  },
  {
    name: 'a touched fact outside the schema',
    rule: rule({ touches: ['daysSinceStart', 'mood'] }),
    message: /mood/,
  },
  {
    name: 'an unmodeled rule that touches no fact',
    rule: rule({ kind: 'unmodeled', when: null, touches: [] }),
    message: /touch/,
  },
  {
    name: 'a limit with no cap or deduction',
    rule: rule({ kind: 'limit', effect: null }),
    message: /effect/,
  },
  {
    name: 'a limit that charges',
    rule: rule({
      kind: 'limit',
      effect: { type: 'charge', amount: 50, percent: null },
    }),
    message: /effect/,
  },
  {
    name: 'a charge with no amount',
    rule: rule({
      kind: 'charge',
      effect: { type: 'charge', amount: null, percent: null },
    }),
    message: /amount/,
  },
  {
    name: 'a negative amount',
    rule: rule({
      kind: 'limit',
      effect: { type: 'cap', amount: -1, percent: null },
    }),
    message: /amount/,
  },
])('rule: $name', ({ rule, message }) => {
  expect(validateRules([rule], clauses, schema)).toEqual([
    { id: 'r-1', message: expect.stringMatching(message) },
  ]);
});

test.each<{ name: string; scenario: Scenario; message: RegExp }>([
  {
    name: 'a missing fact',
    scenario: scenario({ facts: { daysSinceStart: 365, cause: 'fire' } }),
    message: /userPaidOnTime/,
  },
  {
    name: 'a fact outside the schema',
    scenario: scenario({
      facts: {
        daysSinceStart: 365,
        userPaidOnTime: true,
        cause: 'fire',
        mood: 'calm',
      },
    }),
    message: /mood/,
  },
  {
    name: 'a fact of the wrong type',
    scenario: scenario({
      facts: { daysSinceStart: '365', userPaidOnTime: true, cause: 'fire' },
    }),
    message: /daysSinceStart/,
  },
  {
    name: 'a target rule that does not exist',
    scenario: scenario({ targetRuleIds: ['r-1', 'r-404'] }),
    message: /r-404/,
  },
])('scenario: $name', ({ scenario, message }) => {
  expect(validateScenarios([scenario], [rule()], schema)).toEqual([
    { id: 's-1', message: expect.stringMatching(message) },
  ]);
});

test('an ID used twice is reported, for rules and for scenarios', () => {
  expect(validateRules([rule(), rule()], clauses, schema)).toEqual([
    { id: 'r-1', message: expect.stringMatching(/more than once/) },
  ]);
  expect(validateScenarios([scenario(), scenario()], [rule()], schema)).toEqual(
    [{ id: 's-1', message: expect.stringMatching(/more than once/) }],
  );
});
