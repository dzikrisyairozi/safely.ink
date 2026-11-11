import type {
  Clause,
  Condition,
  FactSchema,
  Outcome,
  Rule,
} from '@repo/api-types';
import { evaluate } from '../src/engine/evaluate';
import { BASE_FACTS } from '../src/pipeline/rule-check';
import type { Assertion, Probe, Variant } from './smoke-cases';

export type Extraction = {
  clauses: Clause[];
  factSchema: FactSchema;
  rules: Rule[];
};

export function findClause(clauses: Clause[], anchor: string): Clause {
  const matches = clauses.filter((clause) => clause.text.includes(anchor));
  if (matches.length !== 1)
    throw new Error(
      `Clause anchor ${JSON.stringify(anchor)} matched ${matches.length} clauses (expected 1)`,
    );
  return matches[0]!;
}

function comparisons(
  condition: Condition | null,
): { fact: string; value: unknown }[] {
  if (condition === null) return [];
  if ('all' in condition) return condition.all.flatMap(comparisons);
  if ('any' in condition) return condition.any.flatMap(comparisons);
  if ('not' in condition) return comparisons(condition.not);
  return [condition];
}

export function checkAssertion(
  assertion: Assertion,
  extraction: Extraction,
): string[] {
  let clause: Clause;
  try {
    clause = findClause(extraction.clauses, assertion.clause);
  } catch (err) {
    return [String(err)];
  }
  const matched = extraction.rules.filter((rule) =>
    rule.clauseIds.includes(clause.id),
  );
  const satisfies = matched.some((rule) => {
    const leaves = comparisons(rule.when);
    return (
      (assertion.kind === undefined || rule.kind === assertion.kind) &&
      (assertion.effectType === undefined ||
        rule.effect?.type === assertion.effectType) &&
      (assertion.amount === undefined ||
        rule.effect?.amount === assertion.amount) &&
      (assertion.percent === undefined ||
        rule.effect?.percent === assertion.percent) &&
      (assertion.numberInCondition === undefined ||
        leaves.some((c) => c.value === assertion.numberInCondition)) &&
      (assertion.baseFact === undefined ||
        leaves.some((c) => c.fact === assertion.baseFact))
    );
  });
  return satisfies
    ? []
    : [
        `No rule citing ${JSON.stringify(assertion.clause)} satisfies ${JSON.stringify(assertion)}`,
      ];
}

export function runProbe(probe: Probe, extraction: Extraction): Outcome {
  for (const [key, value] of Object.entries(probe.facts)) {
    const fact = BASE_FACTS.find((entry) => entry.key === key);
    if (!fact || typeof value !== typeof fact.neutral)
      throw new Error(
        `Probe ${probe.id} must override only typed base facts: ${key}`,
      );
  }
  const facts = Object.fromEntries(
    extraction.factSchema.map((fact) => [fact.key, fact.neutral]),
  );
  return evaluate(extraction.rules, extraction.factSchema, {
    id: probe.id,
    story: '',
    strategy: 'baseline',
    frequency: 'common',
    targetRuleIds: [],
    stake: probe.stake,
    facts: { ...facts, ...probe.facts },
  });
}

export function judgeRun(variant: Variant, extraction: Extraction): string[] {
  const failures = variant.assertions.flatMap((assertion) =>
    checkAssertion(assertion, extraction),
  );
  for (const anchor of variant.absent) {
    if (extraction.clauses.some((clause) => clause.text.includes(anchor)))
      failures.push(`Absent anchor ${JSON.stringify(anchor)} is present`);
  }
  for (const probe of variant.probes) {
    try {
      const outcome = runProbe(probe, extraction);
      if (outcome.result !== probe.expect.result)
        failures.push(
          `Probe ${probe.id}: expected ${probe.expect.result}, got ${outcome.result}`,
        );
      if (probe.expect.loss !== undefined && outcome.loss !== probe.expect.loss)
        failures.push(
          `Probe ${probe.id}: expected loss ${probe.expect.loss}, got ${outcome.loss}`,
        );
    } catch (err) {
      failures.push(`Probe ${probe.id}: ${String(err)}`);
    }
  }
  return failures;
}
