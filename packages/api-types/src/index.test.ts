import { expect, test } from 'vitest';
import { Condition, ErrorEnvelope, Rule } from './index.js';

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

test('"in" takes a list and comparisons take a single value', () => {
  const listForComparison = { fact: 'daysSinceStart', op: 'lt', value: ['30'] };
  const scalarForIn = { fact: 'cause', op: 'in', value: 'flood' };

  expect(Condition.safeParse(listForComparison).success).toBe(false);
  expect(Condition.safeParse(scalarForIn).success).toBe(false);
});

test('only an unmodeled rule may have no condition', () => {
  const rule = {
    id: 'r-2',
    kind: 'benefit',
    summary: 'Cover for flood damage',
    clauseIds: ['c-7'],
    when: null,
    effect: null,
    touches: [],
  };

  expect(Rule.safeParse(rule).success).toBe(false);
  expect(Rule.safeParse({ ...rule, kind: 'unmodeled' }).success).toBe(true);
});

test('an error envelope needs both a code and a message', () => {
  const body = { error: { code: 'unauthenticated', message: 'Sign in.' } };

  expect(ErrorEnvelope.parse(body)).toEqual(body);
  expect(
    ErrorEnvelope.safeParse({ error: { message: 'Sign in.' } }).success,
  ).toBe(false);
  expect(ErrorEnvelope.safeParse({ message: 'Sign in.' }).success).toBe(false);
});
