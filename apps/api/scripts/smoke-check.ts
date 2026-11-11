import type {
  Clause,
  Condition,
  FactSchema,
  FactValue,
  Outcome,
  Rule,
} from '@repo/api-types';
import { evaluate, holds } from '../src/engine/evaluate';
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
  const targets = probe.target
    ? extraction.rules.filter(
        (rule) =>
          rule.kind === 'benefit' &&
          rule.clauseIds.includes(
            findClause(extraction.clauses, probe.target!).id,
          ),
      )
    : [];
  if (probe.target && targets.length === 0)
    throw new Error(
      `Probe ${probe.id}: no benefit rule cites its target clause`,
    );
  // A probe sets base facts only, because the model names every other fact.
  // So, as the fuzzer does for a scenario about a benefit, the targeted
  // benefit's own condition is satisfied by trying values for its other
  // facts, and the amount claimed, wherever a cap or deduction asks, is the
  // stake. A benefit whose condition is inverted on a model-named fact is
  // therefore not caught by a probe.
  const neutral = Object.fromEntries(
    extraction.factSchema.map((fact) => [fact.key, fact.neutral]),
  );
  const amounts = new Set(
    extraction.rules
      .filter((rule) => rule.kind === 'limit')
      .flatMap((rule) => comparisons(rule.when).map((c) => c.fact)),
  );
  for (const fact of extraction.factSchema) {
    if (
      probe.stake !== null &&
      amounts.has(fact.key) &&
      fact.type === 'number' &&
      /^(idr|rp|rupiah)$/i.test(fact.unit ?? '')
    )
      neutral[fact.key] = probe.stake;
  }
  const base = { ...neutral, ...probe.facts };
  // Base facts and amounts given the stake are what the probe means, so the
  // search may not change them.
  const fixed = new Set([
    ...BASE_FACTS.map((fact) => fact.key),
    ...Object.keys(probe.facts),
    ...[...amounts].filter((key) => neutral[key] === probe.stake),
  ]);
  const facts =
    targets.length > 0
      ? satisfying(targets, extraction, base, fixed, probe.stake)
      : base;
  return evaluate(extraction.rules, extraction.factSchema, {
    id: probe.id,
    story: '',
    strategy: 'baseline',
    frequency: 'common',
    targetRuleIds: targets.map((rule) => rule.id),
    stake: probe.stake,
    facts,
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

// Values worth trying for one fact: its neutral value, the stake for an
// amount, both booleans, every enum value, and each number its rules compare
// it with, one either side.
function candidates(
  fact: FactSchema[number],
  rules: Rule[],
  stake: number | null,
) {
  if (fact.type === 'boolean') return [true, false];
  if (fact.type === 'enum') return fact.values ?? [];
  const named = rules
    .flatMap((rule) => comparisons(rule.when))
    .filter((c) => c.fact === fact.key && typeof c.value === 'number')
    .flatMap((c) => [
      c.value as number,
      (c.value as number) + 1,
      (c.value as number) - 1,
    ]);
  return [
    ...new Set([
      fact.neutral as number,
      ...(stake === null ? [] : [stake]),
      ...named,
    ]),
  ];
}

// More assignments than this means the benefit's condition is too tangled
// for a probe, and the probe fails rather than run on.
const SEARCH_BUDGET = 4096;

function satisfying(
  targets: Rule[],
  extraction: Extraction,
  base: Record<string, FactValue>,
  fixed: Set<string>,
  stake: number | null,
): Record<string, FactValue> {
  const free = [
    ...new Set(
      targets.flatMap((rule) => comparisons(rule.when).map((c) => c.fact)),
    ),
  ]
    .filter((key) => !fixed.has(key))
    .map((key) => extraction.factSchema.find((fact) => fact.key === key))
    .filter((fact): fact is FactSchema[number] => fact !== undefined);
  const options = free.map((fact) => candidates(fact, extraction.rules, stake));
  let tried = 0;
  const holdsFor = (facts: Record<string, FactValue>) =>
    targets.some((rule) => rule.when !== null && holds(rule.when, facts));
  const search = (
    n: number,
    facts: Record<string, FactValue>,
  ): Record<string, FactValue> | null => {
    if (n === free.length) {
      if (++tried > SEARCH_BUDGET)
        throw new Error(
          `No assignment within ${SEARCH_BUDGET} tries satisfies the targeted benefit`,
        );
      return holdsFor(facts) ? facts : null;
    }
    for (const value of options[n]!) {
      const found = search(n + 1, { ...facts, [free[n]!.key]: value });
      if (found) return found;
    }
    return null;
  };
  // No assignment of the free facts makes the benefit apply, so the
  // scenario keeps its facts and the engine reports what that means.
  return search(0, base) ?? base;
}
