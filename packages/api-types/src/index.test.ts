import { expect, test } from 'vitest';
import { Condition, Rule } from './index.js';

const nested: Condition = {
  all: [
    { fact: 'daysSinceStart', op: 'lt', value: 30 },
    {
      any: [
        { not: { fact: 'userPaidOnTime', op: 'eq', value: true } },
        { fact: 'cause', op: 'in', value: ['flood', 'riot'] },
      ],
    },
  ],
};

test('nested conditions survive a round trip', () => {
  expect(Condition.parse(structuredClone(nested))).toEqual(nested);
});

test('unknown operators are rejected', () => {
  const bad = { fact: 'daysSinceStart', op: 'approximately', value: 30 };

  expect(Condition.safeParse(bad).success).toBe(false);
});

test('a rule must point at a clause', () => {
  const rule = {
    id: 'r-1',
    kind: 'exclusion',
    summary: 'No cover in the first 30 days',
    clauseIds: [],
    when: nested,
    effect: { type: 'deny', amount: null, percent: null },
    touches: ['daysSinceStart'],
  };

  expect(Rule.safeParse(rule).success).toBe(false);
  expect(Rule.safeParse({ ...rule, clauseIds: ['c-4'] }).success).toBe(true);
});
