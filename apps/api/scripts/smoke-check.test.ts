import { expect, test } from 'vitest';
import type { Clause, Rule } from '@repo/api-types';
import { BASE_FACTS, checkFacts } from '../src/pipeline/rule-check';
import {
  checkAssertion,
  findClause,
  judgeRun,
  runProbe,
  type Extraction,
} from './smoke-check';
import type { Probe, Variant } from './smoke-cases';

const clause: Clause = {
  id: 'c',
  number: '1',
  heading: null,
  text: 'Late payment fee',
  gloss: null,
  page: 1,
};
const rule: Rule = {
  id: 'r',
  kind: 'charge',
  summary: '',
  clauseIds: ['c'],
  touches: ['userPaidOnTime'],
  when: {
    not: {
      any: [
        {
          all: [
            { fact: 'userPaidOnTime', op: 'eq', value: true },
            { fact: 'daysSinceStart', op: 'gte', value: 14 },
          ],
        },
      ],
    },
  },
  effect: { type: 'charge', amount: 100, percent: null },
};
const extraction: Extraction = {
  clauses: [clause],
  factSchema: BASE_FACTS,
  rules: [rule],
};
const probe: Probe = {
  id: 'late',
  facts: { userPaidOnTime: false },
  stake: 1000,
  expect: { result: 'partly_bad', loss: 100 },
};
const variant: Variant = {
  id: 'base',
  note: '',
  text: '',
  assertions: [],
  probes: [probe],
  absent: [],
};

test('a clause anchor must identify exactly one clause', () => {
  expect(findClause([clause], 'Late')).toBe(clause);
  expect(() => findClause([clause], 'missing')).toThrow('matched 0');
  expect(() =>
    findClause([clause, { ...clause, id: 'other' }], 'Late'),
  ).toThrow('matched 2');
  expect(checkAssertion({ clause: 'missing' }, extraction)).toHaveLength(1);
});

test('one rule must satisfy all fields, including nested condition numbers and base facts', () => {
  expect(
    checkAssertion(
      {
        clause: 'Late',
        kind: 'charge',
        effectType: 'charge',
        amount: 100,
        numberInCondition: 14,
        baseFact: 'userPaidOnTime',
      },
      extraction,
    ),
  ).toEqual([]);
  for (const fields of [
    { kind: 'limit' as const },
    { effectType: 'cap' as const },
    { amount: 101 },
    { percent: 2 },
    { numberInCondition: 15 },
    { baseFact: 'paperworkComplete' },
  ]) {
    expect(
      checkAssertion({ clause: 'Late', ...fields }, extraction),
    ).toHaveLength(1);
  }
  const split = {
    ...extraction,
    rules: [
      rule,
      {
        ...rule,
        id: 'other',
        kind: 'limit' as const,
        effect: { type: 'cap' as const, amount: 50, percent: null },
      },
    ],
  };
  expect(
    checkAssertion({ clause: 'Late', kind: 'limit', amount: 100 }, split),
  ).toHaveLength(1);
  expect(
    checkAssertion(
      { clause: 'Late' },
      { ...extraction, rules: [{ ...rule, clauseIds: ['elsewhere'] }] },
    ),
  ).toHaveLength(1);
  expect(
    checkAssertion(
      { clause: 'Late', percent: 2 },
      {
        ...extraction,
        rules: [
          { ...rule, effect: { type: 'charge', amount: null, percent: 2 } },
        ],
      },
    ),
  ).toEqual([]);
});

test('probes use neutral facts then base overrides, with empty targets', () => {
  const extra = {
    key: 'extra',
    type: 'boolean',
    values: null,
    unit: null,
    description: '',
    neutral: true,
  };
  const benefit: Rule = {
    ...rule,
    id: 'benefit',
    kind: 'benefit',
    when: { fact: 'extra', op: 'eq', value: false },
    effect: { type: 'grant', amount: null, percent: null },
    touches: ['extra'],
  };
  const own = {
    ...extraction,
    factSchema: checkFacts([extra]),
    rules: [rule, benefit],
  };
  const outcome = runProbe(probe, own);
  expect(outcome).toMatchObject({
    scenarioId: 'late',
    result: 'partly_bad',
    loss: 100,
  });
  expect(outcome.trace.map((step) => step.ruleId)).toEqual(['r']);
  expect(runProbe({ ...probe, facts: {} }, own)).toMatchObject({
    result: 'fine',
    loss: 0,
  });
  expect(() => runProbe({ ...probe, facts: { extra: false } }, own)).toThrow(
    'base facts',
  );
});

test('judgeRun collects all assertion, absent, and probe failures', () => {
  const failed = judgeRun(
    {
      ...variant,
      assertions: [{ clause: 'missing' }, { clause: 'Late', amount: 200 }],
      absent: ['Late'],
      probes: [{ ...probe, expect: { result: 'fine', loss: 0 } }],
    },
    extraction,
  );
  expect(failed).toHaveLength(5);
  expect(failed.join('\n')).toContain('expected fine');
  expect(failed.join('\n')).toContain('expected loss 0');
  expect(judgeRun(variant, extraction)).toEqual([]);
  const broken = {
    ...extraction,
    rules: [
      { ...rule, when: { fact: 'missing', op: 'eq' as const, value: true } },
    ],
  };
  expect(judgeRun(variant, broken)[0]).toContain('Scenario has no fact');
});

test('a cap that applies only above an amount sees the stake in a probe', () => {
  const clause = {
    id: 'c-10',
    text: 'dibatasi paling banyak Rp500.000',
    number: '10',
    heading: null,
    gloss: null,
    page: 1,
  };
  const extraction = {
    clauses: [clause],
    factSchema: [
      ...BASE_FACTS,
      {
        key: 'refundAmount',
        type: 'number' as const,
        values: null,
        unit: 'IDR',
        description: '',
        neutral: 0,
      },
    ],
    rules: [
      {
        id: 'r-cap',
        kind: 'limit' as const,
        summary: '',
        clauseIds: ['c-10'],
        touches: [],
        when: {
          all: [
            { fact: 'paperworkComplete', op: 'eq' as const, value: false },
            { fact: 'refundAmount', op: 'gt' as const, value: 500000 },
          ],
        },
        effect: { type: 'cap' as const, amount: 500000, percent: null },
      },
    ],
  };

  const outcome = runProbe(
    {
      id: 'cap',
      facts: { paperworkComplete: false },
      stake: 1000000,
      expect: { result: 'partly_bad', loss: 500000 },
    },
    extraction,
  );

  expect(outcome).toMatchObject({ result: 'partly_bad', loss: 500000 });
});

const refundClause = {
  id: 'c-8',
  text: 'berhak menerima pengembalian kelebihan',
  number: '8',
  heading: null,
  gloss: null,
  page: 1,
};
const feeClause = {
  id: 'c-13',
  text: 'biaya lain atas kebijakan Kreditur',
  number: '13',
  heading: null,
  gloss: null,
  page: 1,
};
const amountFacts = [
  ...BASE_FACTS,
  {
    key: 'refundAmount',
    type: 'number' as const,
    values: null,
    unit: 'IDR',
    description: '',
    neutral: 0,
  },
  {
    key: 'discretionaryFee',
    type: 'number' as const,
    values: null,
    unit: 'IDR',
    description: '',
    neutral: 0,
  },
];
const refund = (op: 'gt' | 'lte') => ({
  id: 'r-refund',
  kind: 'benefit' as const,
  summary: '',
  clauseIds: ['c-8'],
  touches: ['refundAmount'],
  when: { fact: 'refundAmount', op, value: 0 },
  effect: null,
});
const discretion = {
  id: 'r-fee',
  kind: 'unmodeled' as const,
  summary: '',
  clauseIds: ['c-13'],
  touches: ['discretionaryFee'],
  when: null,
  effect: null,
};
const neutralProbe = {
  id: 'neutral',
  facts: {},
  stake: 1000000,
  target: 'berhak menerima pengembalian kelebihan',
  expect: { result: 'fine' as const, loss: 0 },
};

test('an amount a discretionary clause touches stays neutral in a probe', () => {
  const outcome = runProbe(neutralProbe, {
    clauses: [refundClause, feeClause],
    factSchema: amountFacts,
    rules: [refund('gt'), discretion],
  });

  expect(outcome).toMatchObject({ result: 'fine', loss: 0 });
});

test('a refund that depends on a model-named boolean is satisfied by the probe', () => {
  const overpaid = {
    ...refund('gt'),
    touches: ['hasOverpayment'],
    when: { fact: 'hasOverpayment', op: 'eq' as const, value: true },
  };
  const outcome = runProbe(neutralProbe, {
    clauses: [refundClause],
    factSchema: [
      ...amountFacts,
      {
        key: 'hasOverpayment',
        type: 'boolean' as const,
        values: null,
        unit: null,
        description: '',
        neutral: false,
      },
    ],
    rules: [overpaid],
  });

  expect(outcome).toMatchObject({ result: 'fine', loss: 0 });
});

test('a refund that a base-fact override blocks is bad in a targeted probe', () => {
  const onlyWhenPaid = {
    ...refund('gt'),
    when: { fact: 'userPaidOnTime', op: 'eq' as const, value: true },
  };
  const outcome = runProbe(
    { ...neutralProbe, facts: { userPaidOnTime: false } },
    { clauses: [refundClause], factSchema: amountFacts, rules: [onlyWhenPaid] },
  );

  expect(outcome.result).toBe('bad');
});

test('a probe whose target clause has no benefit rule fails', () => {
  expect(() =>
    runProbe(neutralProbe, {
      clauses: [refundClause],
      factSchema: amountFacts,
      rules: [],
    }),
  ).toThrow(/no benefit rule cites its target clause/);
});
