import fc from 'fast-check';
import { expect, test } from 'vitest';
import type { Condition, FactSchema, Rule, Scenario } from '@repo/api-types';
import { evaluate } from './evaluate';

const schema: FactSchema = [
  {
    key: 'days',
    type: 'number',
    values: null,
    unit: 'days',
    description: 'Days since the start',
    neutral: 365,
  },
  {
    key: 'paid',
    type: 'boolean',
    values: null,
    unit: null,
    description: 'Paid on time',
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
const keys = schema.map((fact) => fact.key);
const neutral = new Map(schema.map((fact) => [fact.key, fact.neutral]));

const comparison: fc.Arbitrary<Condition> = fc.oneof(
  fc.record({
    fact: fc.constant('days'),
    op: fc.constantFrom('eq', 'ne', 'lt', 'lte', 'gt', 'gte'),
    value: fc.integer({ min: 0, max: 400 }),
  }),
  fc.record({
    fact: fc.constant('paid'),
    op: fc.constantFrom('eq', 'ne'),
    value: fc.boolean(),
  }),
  fc.record({
    fact: fc.constant('cause'),
    op: fc.constant('in'),
    value: fc.subarray(['fire', 'flood', 'riot']),
  }),
) as fc.Arbitrary<Condition>;

const condition: fc.Arbitrary<Condition> = fc.oneof(
  comparison,
  fc.array(comparison, { maxLength: 3 }).map((all) => ({ all })),
  fc.array(comparison, { maxLength: 3 }).map((any) => ({ any })),
  comparison.map((not) => ({ not })),
);

const effect = fc.option(
  fc.record({
    type: fc.constantFrom('cap', 'deduct', 'charge'),
    amount: fc.option(fc.integer({ min: 0, max: 2000 })),
    percent: fc.option(fc.integer({ min: 0, max: 100 })),
  }),
);

const ruleBody = fc.record({
  kind: fc.constantFrom(
    'benefit',
    'exclusion',
    'condition',
    'deadline',
    'limit',
    'charge',
    'unmodeled',
  ),
  when: condition,
  effect,
  clauseIds: fc.subarray(['c-1', 'c-2', 'c-3', 'c-4'], { minLength: 1 }),
  touches: fc.subarray(keys),
});

const rules: fc.Arbitrary<Rule[]> = fc
  .array(ruleBody, { maxLength: 8 })
  .map((bodies) =>
    bodies.map((body, n): Rule => ({
      ...body,
      id: `r-${n}`,
      summary: `Rule ${n}`,
      when: body.kind === 'unmodeled' ? null : body.when,
      effect: body.kind === 'unmodeled' ? null : body.effect,
    })),
  );

const facts = fc.record({
  days: fc.integer({ min: 0, max: 400 }),
  paid: fc.boolean(),
  cause: fc.constantFrom('fire', 'flood', 'riot'),
});

const caseOf = fc
  .tuple(
    rules,
    facts,
    fc.option(fc.integer({ min: 0, max: 5000 })),
    fc.array(fc.nat({ max: 7 }), { maxLength: 3 }),
  )
  .map(([rules, facts, stake, targets]) => {
    const scenario: Scenario = {
      id: 's-1',
      story: '',
      strategy: 'combination',
      frequency: 'common',
      targetRuleIds: targets.map((n) => `r-${n}`),
      stake,
      facts,
    };
    return { rules, scenario };
  });

// A benefit on a clause of its own that always applies and that no scenario
// is about.
const unrelated: Rule = {
  id: 'r-unrelated',
  kind: 'benefit',
  summary: 'Something else is paid',
  clauseIds: ['c-elsewhere'],
  when: { all: [] },
  effect: null,
  touches: [],
};

test('an unrelated benefit never changes how a scenario ends', () => {
  fc.assert(
    fc.property(caseOf, ({ rules, scenario }) => {
      const without = evaluate(rules, schema, scenario);
      const withIt = evaluate([...rules, unrelated], schema, scenario);

      expect(withIt.result).toBe(without.result);
      expect(withIt.loss).toBe(without.loss);
      expect(withIt.decidingRuleId).toBe(without.decidingRuleId);
    }),
  );
});

test('an unmodeled rule is traced whenever a scenario reaches it', () => {
  fc.assert(
    fc.property(caseOf, ({ rules, scenario }) => {
      const outcome = evaluate(rules, schema, scenario);
      const traced = new Set(outcome.trace.map((step) => step.ruleId));

      for (const rule of rules) {
        if (rule.kind !== 'unmodeled') continue;
        const offNeutral = rule.touches.some(
          (key) => scenario.facts[key] !== neutral.get(key),
        );
        if (offNeutral || scenario.targetRuleIds.includes(rule.id)) {
          expect(traced.has(rule.id)).toBe(true);
        }
      }
    }),
  );
});

test('the same input always gives the same outcome', () => {
  fc.assert(
    fc.property(caseOf, ({ rules, scenario }) => {
      expect(evaluate(rules, schema, scenario)).toEqual(
        evaluate(structuredClone(rules), schema, structuredClone(scenario)),
      );
    }),
  );
});
