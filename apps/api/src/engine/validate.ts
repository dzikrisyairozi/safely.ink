import type {
  Clause,
  Condition,
  Fact,
  FactSchema,
  Rule,
  Scenario,
} from '@repo/api-types';

// What does not fit, and on which fact, rule or scenario. The caller decides
// what to do about it (repair, demote, drop); nothing here throws.
export type Issue = { id: string; message: string };

type Comparison = Extract<Condition, { fact: string }>;

function fits(fact: Fact, value: unknown): boolean {
  if (fact.type === 'enum') {
    return typeof value === 'string' && (fact.values ?? []).includes(value);
  }
  return typeof value === fact.type;
}

function comparisons(condition: Condition): Comparison[] {
  if ('all' in condition) return condition.all.flatMap(comparisons);
  if ('any' in condition) return condition.any.flatMap(comparisons);
  if ('not' in condition) return comparisons(condition.not);
  return [condition];
}

function comparisonProblem(
  { fact: key, op, value }: Comparison,
  facts: Map<string, Fact>,
): string | null {
  const fact = facts.get(key);
  if (!fact) return `Fact "${key}" is not in the fact schema`;

  if (op === 'in') {
    return fact.type === 'enum' && value.every((item) => fits(fact, item))
      ? null
      : `"in" on "${key}" needs values of that enum`;
  }
  if (op !== 'eq' && op !== 'ne' && fact.type !== 'number') {
    return `"${op}" on "${key}" needs a number fact`;
  }
  return fits(fact, value)
    ? null
    : `Value ${JSON.stringify(value)} does not fit fact "${key}"`;
}

const allowedEffects: Partial<Record<Rule['kind'], string[]>> = {
  limit: ['cap', 'deduct'],
  charge: ['charge'],
};

function effectProblem({ kind, effect }: Rule): string | null {
  const allowed = allowedEffects[kind];
  if (!allowed) return null;

  if (!effect || !allowed.includes(effect.type)) {
    return `A ${kind} rule needs an effect of type ${allowed.join(' or ')}`;
  }
  if (effect.amount !== null && effect.percent !== null) {
    return `A ${kind} rule takes an amount or a percent, not both`;
  }
  const amount = effect.amount ?? effect.percent;
  return amount === null || amount < 0
    ? `A ${kind} rule needs an amount or percent of zero or more`
    : null;
}

export function validateFactSchema(factSchema: FactSchema): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();

  for (const fact of factSchema) {
    const report = (message: string) => issues.push({ id: fact.key, message });

    if (seen.has(fact.key)) report('Fact key is used more than once');
    seen.add(fact.key);

    if (fact.type === 'enum' && !fact.values?.length) {
      report('An enum fact needs values');
    } else if (!fits(fact, fact.neutral)) {
      report('The neutral value does not fit the fact');
    }
  }
  return issues;
}

export function validateRules(
  rules: Rule[],
  clauses: Clause[],
  factSchema: FactSchema,
): Issue[] {
  const issues: Issue[] = [];
  const clauseIds = new Set(clauses.map((clause) => clause.id));
  const facts = new Map(factSchema.map((fact) => [fact.key, fact]));
  const seen = new Set<string>();

  for (const rule of rules) {
    const report = (message: string | null) => {
      if (message) issues.push({ id: rule.id, message });
    };

    if (seen.has(rule.id)) report('Rule ID is used more than once');
    seen.add(rule.id);

    for (const id of rule.clauseIds) {
      if (!clauseIds.has(id)) report(`Clause "${id}" does not exist`);
    }
    for (const comparison of rule.when ? comparisons(rule.when) : []) {
      report(comparisonProblem(comparison, facts));
    }
    for (const key of rule.touches) {
      if (!facts.has(key)) report(`Touched fact "${key}" is not in the schema`);
    }
    // Nothing a scenario could vary, so the engine would never flag it.
    if (rule.kind === 'unmodeled' && rule.touches.length === 0) {
      report('An unmodeled rule must touch at least one fact');
    }
    report(effectProblem(rule));
  }
  return issues;
}

export function validateScenarios(
  scenarios: Scenario[],
  rules: Rule[],
  factSchema: FactSchema,
): Issue[] {
  const issues: Issue[] = [];
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const facts = new Map(factSchema.map((fact) => [fact.key, fact]));
  const seen = new Set<string>();

  for (const scenario of scenarios) {
    const report = (message: string) =>
      issues.push({ id: scenario.id, message });

    if (seen.has(scenario.id)) report('Scenario ID is used more than once');
    seen.add(scenario.id);

    for (const fact of factSchema) {
      if (!(fact.key in scenario.facts)) {
        report(`Fact "${fact.key}" is missing`);
      } else if (!fits(fact, scenario.facts[fact.key])) {
        report(`Fact "${fact.key}" has a value of the wrong type`);
      }
    }
    for (const key of Object.keys(scenario.facts)) {
      if (!facts.has(key)) report(`Fact "${key}" is not in the fact schema`);
    }
    for (const id of scenario.targetRuleIds) {
      if (!ruleIds.has(id)) report(`Target rule "${id}" does not exist`);
    }
  }
  return issues;
}
