import type {
  AnalysisMeta,
  Confidence,
  Coverage,
  Expectation,
  Grade,
  LegalFinding,
  Outcome,
  Rule,
  Scenario,
  Severity,
  Trap,
} from '@repo/api-types';
import { holds } from './evaluate';

// Highest `from` first. The last band also catches anything below it.
type Bands<T> = { from: number; value: T }[];

export type ScoreWeights = {
  // Severity points for the share of the stake the user loses.
  lossBands: Bands<number>;
  // The same, when the scenario has no amount at stake.
  lossWithoutStake: number;
  frequency: Record<Scenario['frequency'], number>;
  law: Record<LegalFinding['status'], number>;
  severityBands: Bands<Severity>;
  // Points off the grade per trap.
  penalty: Record<Severity, number>;
  gradeBands: Bands<Grade>;
  // The best grade a run gets when some rule was never reached.
  untestedBest: Grade;
  // Confidence is high or medium while the undetermined share stays below these.
  undeterminedShare: { high: number; medium: number };
  // High confidence also needs every rule reached and at least `branches` of
  // the branches; medium needs at least `rules` of the rules.
  coverage: { branches: number; rules: number };
};

export type ScoreInput = {
  rules: Rule[];
  scenarios: Scenario[];
  outcomes: Outcome[];
  expectations: Record<string, Expectation>; // by scenario ID
  findings: Record<string, LegalFinding>; // by rule ID
  meta: Pick<AnalysisMeta, 'docType' | 'unreadablePages'>;
};

export type ScoreResult = {
  traps: Trap[];
  points: number;
  grade: Grade;
  confidence: Confidence;
  coverage: Coverage;
};

const rank = { fine: 2, partly_bad: 1, bad: 0 };
const mostSevereFirst: Severity[] = ['critical', 'high', 'medium', 'low'];
const gradeOrder: Grade[] = ['A', 'B', 'C', 'D', 'F'];
const unlawful = (status: LegalFinding['status'] | undefined) =>
  status === 'conflicts' || status === 'restricted';

function band<T>(bands: Bands<T>, x: number): T {
  const hit = bands.find((b) => x >= b.from) ?? bands.at(-1);
  if (!hit) throw new Error('A band list cannot be empty');
  return hit.value;
}

/**
 * How much of the document the scenarios tested. A rule is reached when a
 * run traced it: a rule whose condition held while an earlier stage had
 * already decided was not tested, and a trap of its own could not be seen.
 * A branch is one side of a condition, true or false, and counts once a
 * scenario took it.
 */
export function coverageOf(
  rules: Rule[],
  scenarios: Scenario[],
  outcomes: Outcome[],
): Coverage {
  const traced = new Set(
    outcomes.flatMap((outcome) => outcome.trace.map((step) => step.ruleId)),
  );
  let reached = 0;
  let branches = 0;
  let taken = 0;
  for (const rule of rules) {
    const seen = new Set<boolean>();
    if (rule.when !== null) {
      for (const { facts } of scenarios) {
        try {
          seen.add(holds(rule.when, facts));
        } catch {
          // A scenario without the fact takes neither branch.
        }
      }
      branches += 2;
      taken += seen.size;
    }
    if (traced.has(rule.id)) reached += 1;
  }
  return {
    rules: rules.length ? reached / rules.length : 1,
    branches: branches ? taken / branches : 1,
  };
}

// Turns outcomes into traps, a grade and a confidence. Every number comes
// from `weights`; nothing here is decided by a model.
export function score(input: ScoreInput, weights: ScoreWeights): ScoreResult {
  const { rules, scenarios, outcomes, expectations, findings, meta } = input;
  const frequencyOf = new Map(scenarios.map((s) => [s.id, s.frequency]));

  // Trapped outcomes, grouped by the rule behind them: the rule that decided
  // an outcome worse than expected, and any rule the run reached that the law
  // restricts, whatever the outcome.
  const byRule = new Map<string, Outcome[]>();
  const add = (ruleId: string, outcome: Outcome) => {
    const examples = byRule.get(ruleId) ?? [];
    if (!examples.includes(outcome)) byRule.set(ruleId, [...examples, outcome]);
  };
  for (const outcome of outcomes) {
    const ruleId = outcome.decidingRuleId;
    if (
      ruleId !== null &&
      (outcome.result === 'bad' || outcome.result === 'partly_bad')
    ) {
      const expected = expectations[outcome.scenarioId]?.result;
      const worseThanExpected =
        expected !== undefined && rank[expected] > rank[outcome.result];
      if (worseThanExpected || unlawful(findings[ruleId]?.status)) {
        add(ruleId, outcome);
      }
    }
    for (const step of outcome.trace) {
      if (unlawful(findings[step.ruleId]?.status)) add(step.ruleId, outcome);
    }
  }

  const traps = [...byRule].map(([ruleId, examples]): Trap => {
    // A trap is as bad as its worst example and as common as its most common one.
    const loss = Math.max(
      ...examples.map(({ stake, loss }) =>
        stake
          ? band(weights.lossBands, loss / stake)
          : weights.lossWithoutStake,
      ),
    );
    const frequency = Math.max(
      ...examples.map(
        ({ scenarioId }) =>
          weights.frequency[frequencyOf.get(scenarioId) ?? 'rare'],
      ),
    );
    const law = weights.law[findings[ruleId]?.status ?? 'no_finding'];

    return {
      id: `trap-${ruleId}`,
      ruleId,
      scenarioIds: examples.map((example) => example.scenarioId),
      severity: band(weights.severityBands, loss + frequency + law),
      title: null,
      action: null,
    };
  });
  traps.sort(
    (a, b) =>
      mostSevereFirst.indexOf(a.severity) - mostSevereFirst.indexOf(b.severity),
  );

  const points = traps.reduce(
    (left, trap) => left - weights.penalty[trap.severity],
    100,
  );

  const undetermined = outcomes.filter((o) => o.result === 'undetermined');
  // Nothing tested counts as everything unclear, not as nothing unclear.
  const share = outcomes.length ? undetermined.length / outcomes.length : 1;
  const complete = meta.unreadablePages.length === 0;
  // The general pack has no tuned seeds, so it never claims high confidence.
  const tuned = meta.docType !== 'other';
  const coverage = coverageOf(rules, scenarios, outcomes);
  const allReached = coverage.rules === 1;
  const confidence =
    share < weights.undeterminedShare.high &&
    complete &&
    tuned &&
    allReached &&
    coverage.branches >= weights.coverage.branches
      ? 'high'
      : share < weights.undeterminedShare.medium &&
          coverage.rules >= weights.coverage.rules
        ? 'medium'
        : 'low';

  // A rule no scenario reached could hide a trap, so the grade cannot say
  // there is none.
  const earned = band(weights.gradeBands, points);
  const grade = allReached
    ? earned
    : gradeOrder[
        Math.max(
          gradeOrder.indexOf(earned),
          gradeOrder.indexOf(weights.untestedBest),
        )
      ]!;

  return { traps, points, grade, confidence, coverage };
}
