import type {
  Analysis,
  AnalysisStatus,
  Clause,
  Rule,
  Trap,
} from '@repo/api-types';

export type EvalInput = {
  analysisId: string;
  file: string;
  analysis: Analysis;
  clauses: readonly Clause[];
  rules: readonly Rule[];
  traps: readonly Trap[];
  // Each status the analysis reached, with the time it was seen (ms).
  times: readonly { status: AnalysisStatus; at: number }[];
};

// What a reviewer reads to check one run against the PRD metrics (TSD 9).
export function evalReport(input: EvalInput) {
  const { analysis, times } = input;
  const byId = new Map(input.clauses.map((clause) => [clause.id, clause]));
  const rulesById = new Map(input.rules.map((rule) => [rule.id, rule]));

  const quotes = (ids: readonly string[]) =>
    ids.map((id) => {
      const clause = byId.get(id);
      return {
        id,
        number: clause?.number ?? null,
        page: clause?.page ?? null,
        text: clause?.text ?? null,
      };
    });

  const seconds: Partial<Record<AnalysisStatus, number>> = {};
  times.slice(0, -1).forEach(({ status, at }, i) => {
    seconds[status] = (times[i + 1]!.at - at) / 1000;
  });

  return {
    analysisId: input.analysisId,
    file: input.file,
    meta: analysis.meta,
    status: analysis.status,
    failedStage: analysis.status === 'failed' ? (analysis.stage ?? null) : null,
    seconds,
    totalSeconds:
      times.length > 1 ? (times.at(-1)!.at - times[0]!.at) / 1000 : 0,
    counts: analysis.counts ?? {},
    grade: analysis.grade ?? null,
    confidence: analysis.confidence ?? null,
    rules: input.rules.map((rule) => ({
      id: rule.id,
      kind: rule.kind,
      summary: rule.summary,
      clauses: quotes(rule.clauseIds),
    })),
    traps: input.traps.map((trap) => {
      const rule = rulesById.get(trap.ruleId);
      return {
        id: trap.id,
        severity: trap.severity,
        title: trap.title,
        rule: rule?.summary ?? null,
        scenarios: trap.scenarioIds.length,
        clauses: quotes(rule?.clauseIds ?? []),
      };
    }),
  };
}
