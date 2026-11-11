import fc from 'fast-check';
import { expect, test } from 'vitest';
import type { Condition, FactSchema, Rule, Scenario } from '@repo/api-types';
import { evaluate, holds } from './evaluate';

const schema: FactSchema = [
  {
    key: 'days',
    type: 'number',
    values: null,
    unit: 'days',
    description: '',
    neutral: 365,
  },
  {
    key: 'paid',
    type: 'boolean',
    values: null,
    unit: null,
    description: '',
    neutral: true,
  },
];
const nonnegative = fc.integer({ min: 0, max: 2000 });
const positive = fc.integer({ min: 1, max: 2000 });
const stake = fc.oneof(fc.constant(null), fc.constant(0), positive);
const when: Condition = { fact: 'paid', op: 'eq', value: false };
function scenario(amount: number | null): Scenario {
  return {
    id: 's',
    story: '',
    strategy: 'combination',
    frequency: 'common',
    targetRuleIds: [],
    stake: amount,
    facts: { paid: false, days: 365 },
  };
}
function money(
  id: string,
  type: 'cap' | 'deduct' | 'charge',
  value: number,
  percent = false,
): Rule {
  return {
    id,
    kind: type === 'charge' ? 'charge' : 'limit',
    summary: '',
    clauseIds: [id],
    when,
    touches: ['paid'],
    effect: {
      type,
      amount: percent ? null : value,
      percent: percent ? value : null,
    },
  };
}
const moneyRule = fc
  .tuple(fc.constantFrom('cap', 'deduct', 'charge'), nonnegative, fc.boolean())
  .map(([type, value, percent]) => money('', type, value, percent));
const moneyRules = fc.array(moneyRule, { maxLength: 8 }).map((rules) =>
  rules.map((rule, i) => ({
    ...rule,
    id: `other-${i}`,
    clauseIds: [`other-${i}`],
  })),
);

// The changed rule fires and no denial or unmodeled rule can bypass money.
for (const type of ['charge', 'deduct', 'cap'] as const) {
  test(`${type}: raising a charge or deduction, or lowering a cap, cannot reduce loss`, () => {
    fc.assert(
      fc.property(
        stake,
        nonnegative,
        positive,
        fc.boolean(),
        moneyRules,
        (amount, value, delta, percent, others) => {
          const low = money('changed', type, value, percent);
          const high = money('changed', type, value + delta, percent);
          const s = scenario(amount);
          const beforeRules = [type === 'cap' ? high : low, ...others];
          const afterRules = [type === 'cap' ? low : high, ...others];
          const before = evaluate(beforeRules, schema, s);
          const after = evaluate(afterRules, schema, s);
          expect(before.trace.some((step) => step.ruleId === 'changed')).toBe(
            true,
          );
          expect(after.trace.some((step) => step.ruleId === 'changed')).toBe(
            true,
          );
          expect(after.loss).toBeGreaterThanOrEqual(before.loss);
        },
      ),
    );
  });
}

test.each([
  ['charge', 10, 20, false, 100, 10, 20],
  ['charge', 10, 20, false, null, 10, 20],
  ['charge', 10, 20, true, 100, 10, 20],
  ['deduct', 10, 20, false, 100, 10, 20],
  ['deduct', 10, 20, true, 100, 10, 20],
  ['deduct', 100, 200, false, 100, 100, 100],
  ['cap', 80, 60, false, 100, 20, 40],
  ['cap', 80, 60, true, 100, 20, 40],
] as const)(
  '%s has a money effect (%s to %s, percent %s, stake %s)',
  (type, from, to, percent, amount, before, after) => {
    expect(
      evaluate([money('r', type, from, percent)], schema, scenario(amount))
        .loss,
    ).toBe(before);
    expect(
      evaluate([money('r', type, to, percent)], schema, scenario(amount)).loss,
    ).toBe(after);
  },
);

test('deleting a cap cannot raise loss when both executions reach money', () => {
  fc.assert(
    fc.property(
      stake,
      nonnegative,
      fc.boolean(),
      moneyRules,
      (amount, cap, percent, others) => {
        const s = scenario(amount);
        const before = evaluate(
          [money('deleted', 'cap', cap, percent), ...others],
          schema,
          s,
        );
        const after = evaluate(others, schema, s);
        // Only money rules by construction, including null and zero stakes.
        expect(before.result).not.toBe('undetermined');
        expect(after.result).not.toBe('undetermined');
        expect(before.trace.some((step) => step.ruleId === 'deleted')).toBe(
          true,
        );
        expect(after.loss).toBeLessThanOrEqual(before.loss);
      },
    ),
  );
  expect(evaluate([money('cap', 'cap', 50)], schema, scenario(100)).loss).toBe(
    50,
  );
  expect(evaluate([], schema, scenario(100)).loss).toBe(0);
});

test('deleting a fired shared-clause cap can remove the path to an unmodeled rule', () => {
  const cap = money('cap', 'cap', 50);
  const unclear: Rule = {
    ...cap,
    id: 'unclear',
    kind: 'unmodeled',
    when: null,
    effect: null,
    touches: [],
  };
  const charge = money('fee', 'charge', 10);
  const s = scenario(100);
  expect(evaluate([cap, unclear, charge], schema, s).result).toBe(
    'undetermined',
  );
  expect(evaluate([unclear, charge], schema, s)).toMatchObject({
    result: 'partly_bad',
    loss: 10,
  });
});

const validRule = fc
  .tuple(
    fc.constantFrom<Rule['kind']>(
      'benefit',
      'condition',
      'deadline',
      'exclusion',
      'limit',
      'charge',
      'unmodeled',
    ),
    fc.integer({ min: 0, max: 400 }),
    moneyRule,
  )
  .map(([kind, days, monetary]): Rule => ({
    ...monetary,
    kind,
    when: kind === 'unmodeled' ? null : { fact: 'days', op: 'lt', value: days },
    touches: ['days'],
    effect:
      kind === 'unmodeled'
        ? null
        : kind === 'benefit'
          ? { type: 'grant', amount: null, percent: null }
          : kind === 'limit'
            ? { ...monetary.effect!, type: 'deduct' }
            : kind === 'charge'
              ? { ...monetary.effect!, type: 'charge' }
              : { type: 'deny', amount: null, percent: null },
  }));
const rules = fc
  .array(validRule, { minLength: 2, maxLength: 12 })
  .map((entries) =>
    entries.map((rule, i) => ({
      ...rule,
      id: `r-${i}`,
      clauseIds: [`c-${i}`],
    })),
  );

test('adding a fact absent from all conditions and touches leaves the outcome unchanged', () => {
  fc.assert(
    fc.property(
      rules,
      stake,
      fc.integer({ min: 0, max: 400 }),
      fc.boolean(),
      (entries, amount, days, extra) => {
        const s = { ...scenario(amount), facts: { paid: false, days } };
        const added: FactSchema = [
          ...schema,
          {
            key: 'unused',
            type: 'boolean',
            values: null,
            unit: null,
            description: '',
            neutral: true,
          },
        ];
        expect(
          evaluate(entries, added, {
            ...s,
            facts: { ...s.facts, unused: extra },
          }),
        ).toEqual(evaluate(entries, schema, s));
      },
    ),
  );
});

test('interleaving different kinds preserves result and loss with order within each kind fixed', () => {
  fc.assert(
    fc.property(
      rules,
      stake,
      fc.integer({ min: 0, max: 400 }),
      (entries, amount, days) => {
        const kinds: Rule['kind'][] = [
          'charge',
          'limit',
          'unmodeled',
          'exclusion',
          'deadline',
          'condition',
          'benefit',
        ];
        const reordered = kinds.flatMap((kind) =>
          entries.filter((rule) => rule.kind === kind),
        );
        const s = { ...scenario(amount), facts: { paid: false, days } };
        const before = evaluate(entries, schema, s);
        const after = evaluate(reordered, schema, s);
        expect(after.result).toBe(before.result);
        expect(after.loss).toBe(before.loss);
      },
    ),
  );
  const entries = [
    money('fee', 'charge', 10),
    money('deduction', 'deduct', 20),
    money('cap', 'cap', 80),
  ];
  expect(evaluate(entries, schema, scenario(100)).loss).toBe(50);
  expect(
    evaluate([entries[1]!, entries[2]!, entries[0]!], schema, scenario(100))
      .loss,
  ).toBe(50);
});

test('broadening a denial keeps an existing bad outcome bad', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<Rule['kind']>('condition', 'deadline', 'exclusion'),
      positive,
      nonnegative,
      stake,
      (kind, threshold, delta, amount) => {
        // days is in the old firing set, which is contained in the new set.
        const oldWhen: Condition = { fact: 'days', op: 'lt', value: threshold };
        const newWhen: Condition = {
          fact: 'days',
          op: 'lt',
          value: threshold + delta,
        };
        const rule: Rule = {
          id: 'denial',
          kind,
          summary: '',
          clauseIds: ['c'],
          touches: ['days'],
          when: oldWhen,
          effect: { type: 'deny', amount: null, percent: null },
        };
        const s = {
          ...scenario(amount),
          facts: { paid: false, days: threshold - 1 },
        };
        fc.pre(holds(oldWhen, s.facts) && holds(newWhen, s.facts));
        expect(evaluate([rule], schema, s).result).toBe('bad');
        expect(evaluate([{ ...rule, when: newWhen }], schema, s).result).toBe(
          'bad',
        );
      },
    ),
  );
});
