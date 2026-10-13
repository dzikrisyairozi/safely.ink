import { holds } from '../engine/evaluate';
import type {
  Condition,
  Fact,
  FactSchema,
  FactValue,
  Rule,
  Scenario,
} from '@repo/api-types';

// A boundary scenario without its story. Code sets the facts (F-FUZZ-4); the
// model only tells what happened.
export type BoundaryDraft = {
  targetRuleIds: string[];
  facts: Scenario['facts'];
  // What differs from an uneventful situation, in words, for the model.
  situation: string;
};

type Comparison = Extract<Condition, { fact: string }>;
type Threshold = { rule: Rule; at: Comparison; siblings: Comparison[] };

// ponytail: step of 1 for every unit. A threshold of 0.5 or of 10,000,000 IDR
// gets a boundary that is too wide or too narrow; take the step from the
// fact's unit when a document shows it matters.
const STEP = 1;
// Three scenarios each, so the boundaries cannot fill the cap alone.
const MAX_THRESHOLDS = 5;

const isComparison = (condition: Condition): condition is Comparison =>
  'fact' in condition;

// Every comparison of a condition, with the comparisons that must hold too
// for the rule to apply. Those are known only in an `all` group at the top:
// under `any` or `not` the rule does not depend on them in one plain way.
function comparisons(
  condition: Condition,
  top = true,
): Pick<Threshold, 'at' | 'siblings'>[] {
  if (isComparison(condition)) return [{ at: condition, siblings: [] }];
  if ('not' in condition) return comparisons(condition.not, false);
  if ('any' in condition) {
    return condition.any.flatMap((member) => comparisons(member, false));
  }
  return condition.all.flatMap((member) =>
    top && isComparison(member)
      ? [
          {
            at: member,
            siblings: condition.all
              .filter(isComparison)
              .filter((other) => other !== member),
          },
        ]
      : comparisons(member, false),
  );
}

// A value of the fact for which the comparison holds.
function satisfying({ op, value }: Comparison, fact: Fact): FactValue {
  if (op === 'in') return value[0] ?? fact.neutral;
  if (op === 'eq' || op === 'lte' || op === 'gte') return value;
  if (typeof value === 'number')
    return op === 'lt' ? value - STEP : value + STEP;
  if (typeof value === 'boolean') return !value;
  return (fact.values ?? []).find((option) => option !== value) ?? fact.neutral;
}

const inWords = (fact: Fact, value: FactValue) =>
  `${fact.description}: ${value}${fact.unit ? ` ${fact.unit}` : ''}`;

/**
 * The scenarios just inside, on and just outside each number a rule depends
 * on. Expects rules that passed the rule check.
 */
export function boundaryDrafts(
  rules: Rule[],
  factSchema: FactSchema,
): BoundaryDraft[] {
  const facts = new Map(factSchema.map((fact) => [fact.key, fact]));
  const neutral = Object.fromEntries(
    factSchema.map((fact) => [fact.key, fact.neutral]),
  );

  const againstUserFirst = [
    ...rules.filter((rule) => rule.kind !== 'benefit'),
    ...rules.filter((rule) => rule.kind === 'benefit'),
  ];
  const thresholds: Threshold[] = againstUserFirst
    .flatMap((rule) =>
      rule.when
        ? comparisons(rule.when).map((found) => ({ rule, ...found }))
        : [],
    )
    .filter(
      ({ at }) =>
        ['lt', 'lte', 'gt', 'gte'].includes(at.op) &&
        typeof at.value === 'number',
    );

  // A threshold that several rules share gives the same facts for each of
  // them: it is tried once, for all of them, and takes one place.
  const trios = new Map<string, BoundaryDraft[]>();
  for (const { rule, at, siblings } of thresholds) {
    const fact = facts.get(at.fact)!;
    const threshold = at.value as number;
    // One value for each other fact: one that all its siblings accept, if
    // the value that satisfies one of them does.
    const about = siblings.filter((sibling) => sibling.fact !== at.fact);
    const others = [...new Set(about.map((sibling) => sibling.fact))].map(
      (key) => {
        const of = facts.get(key)!;
        const group = about.filter((sibling) => sibling.fact === key);
        const values = group.map((sibling) => satisfying(sibling, of));
        const value =
          values.find((candidate) =>
            group.every((sibling) => holds(sibling, { [key]: candidate })),
          ) ?? values[0]!;
        return { fact: of, value };
      },
    );

    const drafts = [threshold - STEP, threshold, threshold + STEP]
      .filter((value) => value >= 0 || (fact.neutral as number) < 0)
      .map((value) => ({
        targetRuleIds: [rule.id],
        facts: {
          ...neutral,
          ...Object.fromEntries(others.map((o) => [o.fact.key, o.value])),
          [at.fact]: value,
        },
        situation: [{ fact, value }, ...others]
          .map((changed) => inWords(changed.fact, changed.value))
          .join('; '),
      }));

    if (drafts.length === 0) continue;
    const key = JSON.stringify(drafts.map((draft) => draft.facts));
    const shared = trios.get(key);
    if (!shared) {
      trios.set(key, drafts);
    } else if (!shared[0]?.targetRuleIds.includes(rule.id)) {
      for (const draft of shared) draft.targetRuleIds.push(rule.id);
    }
  }
  return [...trios.values()].slice(0, MAX_THRESHOLDS).flat();
}
