import type {
  Condition,
  FactSchema,
  Outcome,
  Rule,
  Scenario,
} from '@repo/api-types';

type Facts = Scenario['facts'];

function holds(condition: Condition, facts: Facts): boolean {
  if ('all' in condition) return condition.all.every((c) => holds(c, facts));
  if ('any' in condition) return condition.any.some((c) => holds(c, facts));
  if ('not' in condition) return !holds(condition.not, facts);

  const { fact, op, value } = condition;
  const actual = facts[fact];
  if (actual === undefined) {
    throw new Error(`Scenario has no fact "${fact}"`);
  }

  if (op === 'eq') return actual === value;
  if (op === 'ne') return actual !== value;
  if (op === 'in') return value.some((item) => item === actual);

  if (typeof actual !== 'number' || typeof value !== 'number') {
    throw new Error(`Cannot order fact "${fact}": "${op}" needs numbers`);
  }
  if (op === 'lt') return actual < value;
  if (op === 'lte') return actual <= value;
  if (op === 'gt') return actual > value;
  return actual >= value;
}

// The fact to show next to a rule in the trace: the leftmost comparison, or
// for `any` the leftmost one that holds.
function triggerOf(condition: Condition | null, facts: Facts): string | null {
  if (condition === null) return null;
  if ('all' in condition) return triggerOf(condition.all[0] ?? null, facts);
  if ('any' in condition) {
    const hit = condition.any.find((c) => holds(c, facts)) ?? condition.any[0];
    return triggerOf(hit ?? null, facts);
  }
  if ('not' in condition) return triggerOf(condition.not, facts);
  return condition.fact;
}

const stageNotes: Partial<Record<Rule['kind'], string>> = {
  benefit: 'Benefit applies',
  condition: 'Condition not met',
  deadline: 'Deadline missed',
  exclusion: 'Exclusion applies',
};

// Decides one scenario. The stages run in a fixed order and the first one
// that settles the result ends the run: benefit, conditions and deadlines,
// exclusions, unmodeled rules, money.
export function evaluate(
  rules: Rule[],
  factSchema: FactSchema,
  scenario: Scenario,
): Outcome {
  const { facts, stake } = scenario;
  const trace: Outcome['trace'] = [];

  const fired = rules.filter(
    (rule) => rule.when !== null && holds(rule.when, facts),
  );
  const firedOf = (...kinds: Rule['kind'][]) => {
    const stage = fired.filter((rule) => kinds.includes(rule.kind));
    for (const rule of stage) {
      trace.push({
        ruleId: rule.id,
        fact: triggerOf(rule.when, facts),
        note: stageNotes[rule.kind] ?? rule.kind,
      });
    }
    return stage;
  };
  const outcome = (
    result: Outcome['result'],
    loss: number,
    decidingRuleId: string | null,
  ): Outcome => ({
    scenarioId: scenario.id,
    result,
    stake,
    loss,
    decidingRuleId,
    trace,
  });
  const denied = (rule: Rule) => outcome('bad', stake ?? 0, rule.id);

  const benefits = firedOf('benefit');
  const targeted = rules.find(
    (rule) =>
      rule.kind === 'benefit' && scenario.targetRuleIds.includes(rule.id),
  );
  if (targeted && benefits.length === 0) {
    trace.push({
      ruleId: targeted.id,
      fact: triggerOf(targeted.when, facts),
      note: 'No benefit in the document applies',
    });
    return denied(targeted);
  }

  const breaches = firedOf('condition', 'deadline');
  if (breaches[0]) return denied(breaches[0]);

  const exclusions = firedOf('exclusion');
  if (exclusions[0]) return denied(exclusions[0]);

  const neutral = new Map(factSchema.map((fact) => [fact.key, fact.neutral]));
  for (const rule of rules) {
    if (rule.kind !== 'unmodeled') continue;
    const fact = rule.touches.find((key) => facts[key] !== neutral.get(key));
    if (fact !== undefined) {
      trace.push({
        ruleId: rule.id,
        fact,
        note: 'Depends on wording that code cannot decide',
      });
      return outcome('undetermined', 0, rule.id);
    }
  }

  return outcome('fine', 0, null);
}
