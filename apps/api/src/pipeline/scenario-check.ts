import {
  Scenario,
  Strategy,
  type FactSchema,
  type Rule,
} from '@repo/api-types';
import { validateScenarios } from '../engine/validate';

// A scenario as a call returned it, with the strategy the call was for.
export type Proposal = { strategy: Strategy; entry: unknown };

const Draft = Scenario.omit({ id: true });
const MAX_STORY = 600; // characters; three sentences fit well inside
// So the report can also show what works (F-FUZZ-6), whatever else is cut.
const BASELINE_KEPT = 4;

const order = (scenario: { strategy: Strategy }) =>
  Strategy.options.indexOf(scenario.strategy);

/**
 * Decides which proposed scenarios are stored (TSD 5.3). A scenario that
 * does not fit the fact schema or the rules is dropped, not repaired.
 */
export function checkScenarios(
  proposals: Proposal[],
  rules: Rule[],
  factSchema: FactSchema,
  cap: number,
): { scenarios: Scenario[]; dropped: string[]; uncovered: string[] } {
  const dropped: string[] = [];

  const drafts: Scenario[] = [];
  for (const [n, { strategy, entry }] of proposals.entries()) {
    // The strategy is the one of the call, whatever the entry says.
    const draft = Draft.safeParse({ ...(entry as object), strategy });
    const story = draft.data?.story.trim() ?? '';
    if (!draft.success) {
      dropped.push(`${strategy}: ${draft.error.issues[0]?.message}`);
    } else if (!story || story.length > MAX_STORY) {
      dropped.push(`${strategy}: no story of a usable length`);
    } else {
      drafts.push({ ...draft.data, story, id: `p-${n}` });
    }
  }

  const issues = validateScenarios(drafts, rules, factSchema);
  for (const { id, message } of issues) dropped.push(`${id}: ${message}`);
  const invalid = new Set(issues.map((issue) => issue.id));

  // Same value for every fact: the same situation told twice.
  const distinct = new Map<string, Scenario>();
  const inStrategyOrder = drafts
    .filter((draft) => !invalid.has(draft.id))
    .sort((a, b) => order(a) - order(b));
  for (const scenario of inStrategyOrder) {
    const facts = JSON.stringify(
      factSchema.map((fact) => scenario.facts[fact.key]),
    );
    const first = distinct.get(facts);
    if (!first) {
      distinct.set(facts, scenario);
    } else {
      first.targetRuleIds = [
        ...new Set([...first.targetRuleIds, ...scenario.targetRuleIds]),
      ].sort();
    }
  }

  const all = [...distinct.values()];
  const againstUser = rules.filter((rule) => rule.kind !== 'benefit');
  const kept = new Set<Scenario>();
  const keep = (scenario: Scenario | undefined) => {
    if (scenario && kept.size < cap) kept.add(scenario);
  };

  if (all.length <= cap) {
    all.forEach(keep);
  } else {
    all
      .filter((scenario) => scenario.strategy === 'baseline')
      .slice(0, BASELINE_KEPT)
      .forEach(keep);
    // A boundary says something only next to its neighbours: cut the one
    // just outside a limit and the two that are left both end the same way.
    all.filter((scenario) => scenario.strategy === 'boundary').forEach(keep);
    // The cap must not take the only scenario of a rule that can hurt the
    // user (F-FUZZ-3).
    for (const { id } of againstUser) {
      const tries = (scenario: Scenario) => scenario.targetRuleIds.includes(id);
      if (![...kept].some(tries)) keep(all.find(tries));
    }
    // Then one of each strategy in turn.
    const waiting = Strategy.options.map((strategy) =>
      all.filter((s) => s.strategy === strategy && !kept.has(s)),
    );
    while (kept.size < cap && waiting.some((queue) => queue.length > 0)) {
      for (const queue of waiting) keep(queue.shift());
    }
  }

  const scenarios = all
    .filter((scenario) => kept.has(scenario))
    .map((scenario, n) => ({
      ...scenario,
      id: `s-${String(n + 1).padStart(3, '0')}`,
    }));
  const uncovered = againstUser
    .filter(({ id }) => !scenarios.some((s) => s.targetRuleIds.includes(id)))
    .map((rule) => rule.id);

  return { scenarios, dropped, uncovered };
}
