import { expect, test } from 'vitest';
import type { FactSchema } from '@repo/api-types';
import { conditionLines } from './condition-text';

const facts: FactSchema = [
  {
    key: 'daysSinceStart',
    type: 'number',
    values: null,
    unit: 'days',
    description: 'Days since the agreement started',
    neutral: 0,
  },
  {
    key: 'userPaidOnTime',
    type: 'boolean',
    values: null,
    unit: null,
    description: 'You paid everything you owed on time',
    neutral: true,
  },
  {
    key: 'lossType',
    type: 'enum',
    values: ['service', 'lost_data', 'lost_income'],
    unit: null,
    description: 'The kind of loss',
    neutral: 'service',
  },
  {
    key: 'amountClaimed',
    type: 'number',
    values: null,
    unit: 'IDR',
    description: 'The amount you claim',
    neutral: 0,
  },
];

test('a comparison reads as the description of the fact, the operator and the value with its unit', () => {
  const line = conditionLines(
    { fact: 'daysSinceStart', op: 'lt', value: 30 },
    facts,
  );

  expect(line).toEqual({
    fact: 'Days since the agreement started',
    op: 'lt',
    value: '30 days',
  });
});

test('a large amount is grouped and an option loses its underscores', () => {
  expect(
    conditionLines({ fact: 'amountClaimed', op: 'gt', value: 1000000 }, facts),
  ).toMatchObject({ value: '1,000,000 IDR' });
  expect(
    conditionLines({ fact: 'lossType', op: 'eq', value: 'lost_data' }, facts),
  ).toMatchObject({ value: 'lost data' });
});

test('a yes or no stays a boolean for the screen to word', () => {
  expect(
    conditionLines({ fact: 'userPaidOnTime', op: 'eq', value: false }, facts),
  ).toMatchObject({ op: 'eq', value: false });
});

test('"in" lists the options', () => {
  expect(
    conditionLines(
      { fact: 'lossType', op: 'in', value: ['lost_data', 'lost_income'] },
      facts,
    ),
  ).toMatchObject({ op: 'in', value: 'lost data, lost income' });
});

test('groups keep their nesting', () => {
  const line = conditionLines(
    {
      all: [
        { fact: 'daysSinceStart', op: 'lt', value: 30 },
        { not: { fact: 'userPaidOnTime', op: 'eq', value: true } },
      ],
    },
    facts,
  );

  expect(line).toMatchObject({
    join: 'all',
    lines: [{ op: 'lt' }, { join: 'not', lines: [{ op: 'eq', value: true }] }],
  });
});

test('a fact that is not in the schema shows its key', () => {
  expect(
    conditionLines({ fact: 'mood', op: 'eq', value: 'bad' }, facts),
  ).toEqual({ fact: 'mood', op: 'eq', value: 'bad' });
});

test('a number is grouped the way the language of the screen does it', () => {
  expect(
    conditionLines(
      { fact: 'amountClaimed', op: 'gt', value: 1000000 },
      facts,
      'id',
    ),
  ).toMatchObject({ value: '1.000.000 IDR' });
});
