import type {
  AnalysisMeta,
  Confidence,
  Expectation,
  Grade,
  LegalFinding,
  Outcome,
  Scenario,
  Severity,
  Trap,
} from '@repo/api-types';

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
  // Confidence is high or medium while the undetermined share stays below these.
  undeterminedShare: { high: number; medium: number };
};

export type ScoreInput = {
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
};

const rank = { fine: 2, partly_bad: 1, bad: 0 };
const mostSevereFirst: Severity[] = ['critical', 'high', 'medium', 'low'];

function band<T>(bands: Bands<T>, x: number): T {
  const hit = bands.find((b) => x >= b.from) ?? bands.at(-1);
  if (!hit) throw new Error('A band list cannot be empty');
  return hit.value;
}

// Turns outcomes into traps, a grade and a confidence. Every number comes
// from `weights`; nothing here is decided by a model.
export function score(input: ScoreInput, weights: ScoreWeights): ScoreResult {
  const { scenarios, outcomes, expectations, findings, meta } = input;
  const frequencyOf = new Map(scenarios.map((s) => [s.id, s.frequency]));

  // Trapped outcomes, grouped by the rule that decided them.
  const byRule = new Map<string, Outcome[]>();
  for (const outcome of outcomes) {
    const ruleId = outcome.decidingRuleId;
    if (outcome.result === 'fine' || outcome.result === 'undetermined')
      continue;
    if (ruleId === null) continue;

    const expected = expectations[outcome.scenarioId]?.result;
    const worseThanExpected =
      expected !== undefined && rank[expected] > rank[outcome.result];
    const status = findings[ruleId]?.status;

    if (
      worseThanExpected ||
      status === 'conflicts' ||
      status === 'restricted'
    ) {
      byRule.set(ruleId, [...(byRule.get(ruleId) ?? []), outcome]);
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
  const share = outcomes.length ? undetermined.length / outcomes.length : 0;
  const complete = meta.unreadablePages.length === 0;
  // The general pack has no tuned seeds, so it never claims high confidence.
  const tuned = meta.docType !== 'other';
  const confidence =
    share < weights.undeterminedShare.high && complete && tuned
      ? 'high'
      : share < weights.undeterminedShare.medium
        ? 'medium'
        : 'low';

  return { traps, points, grade: band(weights.gradeBands, points), confidence };
}
