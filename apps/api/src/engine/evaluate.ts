import type {
  Condition,
  FactSchema,
  Outcome,
  Rule,
  Scenario,
} from '@repo/api-types';

type Facts = Scenario['facts'];

export function holds(condition: Condition, facts: Facts): boolean {
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

const stageNotes = {
  benefit: 'Benefit applies',
  condition: 'Condition not met',
  deadline: 'Deadline missed',
  exclusion: 'Exclusion applies',
};

const moneyNotes = {
  cap: 'Cap applies',
  deduct: 'Deduction applies',
  charge: 'Charge applies',
};

// Decides one scenario. The stages run in a fixed order and the first one
// that settles the result decides it: benefit, conditions and deadlines,
// exclusions, unmodeled rules, money. Unmodeled rules are checked even after
// a denial, so the trace shows every clause code could not decide.
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
  const firedOf = (...kinds: (keyof typeof stageNotes)[]) => {
    const stage: Rule[] = [];
    for (const rule of fired) {
      const kind = kinds.find((k) => k === rule.kind);
      if (!kind) continue;

      stage.push(rule);
      trace.push({
        ruleId: rule.id,
        fact: triggerOf(rule.when, facts),
        note: stageNotes[kind],
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

  // Only a benefit the scenario is about can pay it. Another benefit that
  // fires is traced, and it does not stand in for the one that did not.
  const benefits = firedOf('benefit');
  const targeted = rules.filter(
    (rule) =>
      rule.kind === 'benefit' && scenario.targetRuleIds.includes(rule.id),
  );
  const missed =
    targeted.length > 0 && !targeted.some((rule) => benefits.includes(rule))
      ? targeted[0]
      : undefined;
  if (missed) {
    trace.push({
      ruleId: missed.id,
      fact: triggerOf(missed.when, facts),
      note: 'The benefit this scenario is about does not apply',
    });
  }

  const denial =
    missed ?? firedOf('condition', 'deadline')[0] ?? firedOf('exclusion')[0];

  // An unmodeled rule is reported whenever the scenario reaches its clause:
  // one of its facts is off neutral, the scenario is about it, or a rule
  // citing the same clause fired. It is reported beside a denial too, and
  // the denial still decides.
  const neutral = new Map(factSchema.map((fact) => [fact.key, fact.neutral]));
  const firedClauses = new Set(fired.flatMap((rule) => rule.clauseIds));
  const unclear = rules.filter((rule) => {
    if (rule.kind !== 'unmodeled') return false;
    const fact = rule.touches.find((key) => facts[key] !== neutral.get(key));
    const reached =
      fact !== undefined ||
      scenario.targetRuleIds.includes(rule.id) ||
      rule.clauseIds.some((id) => firedClauses.has(id));
    if (reached) {
      trace.push({
        ruleId: rule.id,
        fact: fact ?? null,
        note: 'Depends on wording that code cannot decide',
      });
    }
    return reached;
  });

  if (denial) return denied(denial);
  if (unclear[0]) return outcome('undetermined', 0, unclear[0].id);

  // Money. Caps come first (lowest wins), deductions come off what is left,
  // charges are owed on top, so a loss can exceed the stake.
  const effectsOf = (type: 'cap' | 'deduct' | 'charge') =>
    fired.flatMap((rule) =>
      (rule.kind === 'limit' || rule.kind === 'charge') &&
      rule.effect?.type === type
        ? [
            {
              rule,
              type,
              amount:
                rule.effect.amount ??
                ((stake ?? 0) * (rule.effect.percent ?? 0)) / 100,
            },
          ]
        : [],
    );

  let payable = stake ?? 0;
  let charges = 0;
  const lossSoFar = () => (stake ?? 0) - payable + charges;
  const lostTo = new Map<string, number>();

  for (const { rule, type, amount } of [
    ...effectsOf('cap').sort((a, b) => a.amount - b.amount),
    ...effectsOf('deduct'),
    ...effectsOf('charge'),
  ]) {
    const before = lossSoFar();
    if (type === 'cap') payable = Math.min(payable, amount);
    if (type === 'deduct') payable = Math.max(0, payable - amount);
    if (type === 'charge') charges += amount;

    lostTo.set(rule.id, lossSoFar() - before);
    trace.push({
      ruleId: rule.id,
      fact: triggerOf(rule.when, facts),
      note:
        stake === null && lostTo.get(rule.id) === 0
          ? 'No amount at stake to apply this to'
          : moneyNotes[type],
    });
  }

  const loss = lossSoFar();
  if (loss === 0) return outcome('fine', 0, null);

  const deciding = rules.find((rule) => (lostTo.get(rule.id) ?? 0) > 0);
  const result = stake === null || loss >= stake ? 'bad' : 'partly_bad';
  return outcome(result, loss, deciding?.id ?? null);
}
