import fc from 'fast-check';
import { expect, test } from 'vitest';
import type { Rule, Scenario } from '@repo/api-types';
import { config } from '../config';
import { evaluate } from './evaluate';
import { score, type ScoreInput } from './score';

const weights = config.scoring;
const evidence = fc
  .array(
    fc.record({
      charge: fc.integer({ min: 1, max: 200 }),
      stake: fc.oneof(
        fc.constant(null),
        fc.constant(0),
        fc.integer({ min: 1, max: 1000 }),
      ),
      frequency: fc.constantFrom<Scenario['frequency']>(
        'rare',
        'occasional',
        'common',
      ),
    }),
    { maxLength: 8 },
  )
  .map((entries): ScoreInput => {
    const rules: Rule[] = entries.map(({ charge }, i) => ({
      id: `r-${i}`,
      kind: 'charge',
      summary: '',
      clauseIds: [`c-${i}`],
      touches: [],
      when: { all: [] },
      effect: { type: 'charge', amount: charge, percent: null },
    }));
    const scenarios: Scenario[] = entries.map(({ stake, frequency }, i) => ({
      id: `s-${i}`,
      stake,
      frequency,
      story: '',
      strategy: 'baseline',
      targetRuleIds: [],
      facts: {},
    }));
    return {
      rules,
      scenarios,
      outcomes: scenarios.map((s, i) => evaluate([rules[i]!], [], s)),
      expectations: Object.fromEntries(
        scenarios.map((s) => [s.id, { result: 'fine', reason: '' }]),
      ),
      findings: {},
      meta: { docType: 'loan', unreadablePages: [] },
    };
  });

test('appending worse-than-expected evidence under a fresh scenario ID cannot raise points', () => {
  fc.assert(
    fc.property(evidence, fc.boolean(), (input, reuseRule) => {
      const rule: Rule =
        reuseRule && input.rules.length
          ? input.rules[0]!
          : {
              id: 'fresh-rule',
              kind: 'charge',
              summary: '',
              clauseIds: ['fresh-clause'],
              touches: [],
              when: { all: [] },
              effect: { type: 'charge', amount: 100, percent: null },
            };
      const scenario: Scenario = {
        id: 'fresh-scenario',
        stake: 100,
        frequency: 'common',
        story: '',
        strategy: 'baseline',
        targetRuleIds: [],
        facts: {},
      };
      const outcome = evaluate([rule], [], scenario);
      expect(input.scenarios.some((s) => s.id === scenario.id)).toBe(false);
      expect(['bad', 'partly_bad']).toContain(outcome.result);
      const after = score(
        {
          ...input,
          rules: input.rules.includes(rule)
            ? input.rules
            : [...input.rules, rule],
          scenarios: [...input.scenarios, scenario],
          outcomes: [...input.outcomes, outcome],
          expectations: {
            ...input.expectations,
            [scenario.id]: { result: 'fine', reason: '' },
          },
        },
        weights,
      );
      expect(
        after.traps.some((trap) => trap.scenarioIds.includes(scenario.id)),
      ).toBe(true);
      expect(after.points).toBeLessThanOrEqual(score(input, weights).points);
      if (!reuseRule || input.rules.length === 0)
        expect(after.points).toBeLessThan(score(input, weights).points);
    }),
  );
});

test('an untraced rule caps the grade at untestedBest with trap evidence and points fixed', () => {
  fc.assert(
    fc.property(evidence, (input) => {
      const untraced: Rule = {
        id: 'untraced',
        kind: 'exclusion',
        summary: '',
        clauseIds: ['untraced'],
        touches: [],
        when: { any: [] },
        effect: { type: 'deny', amount: null, percent: null },
      };
      const before = score(input, weights);
      const after = score(
        { ...input, rules: [...input.rules, untraced] },
        weights,
      );
      expect(
        input.outcomes.every((outcome) =>
          outcome.trace.every((step) => step.ruleId !== untraced.id),
        ),
      ).toBe(true);
      expect(after.traps).toEqual(before.traps);
      expect(after.points).toBe(before.points);
      const grades = ['A', 'B', 'C', 'D', 'F'];
      expect(after.grade).toBe(
        grades[
          Math.max(
            grades.indexOf(before.grade),
            grades.indexOf(weights.untestedBest),
          )
        ],
      );
      if (input.rules.length === 0) {
        expect(before.grade).toBe('A');
        expect(after.grade).toBe(weights.untestedBest);
      }
    }),
    {
      examples: [
        [
          {
            rules: [],
            scenarios: [],
            outcomes: [],
            expectations: {},
            findings: {},
            meta: { docType: 'loan', unreadablePages: [] },
          },
        ],
      ],
    },
  );
});
