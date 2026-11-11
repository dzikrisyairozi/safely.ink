import type { AnalysisMeta, Clause, FactSchema } from '@repo/api-types';
import { proposeRules, repairRules } from '../agents/rule-extractor';
import { checkRules, demote, numbered } from './rule-check';

export async function rulesFor(
  clauses: Clause[],
  factSchema: FactSchema,
  meta: AnalysisMeta,
) {
  const diagnostics: { repairError: string | null; demoted: string[] } = {
    repairError: null,
    demoted: [],
  };
  const drafts = numbered(await proposeRules(clauses, factSchema, meta));
  const first = checkRules(drafts, clauses, factSchema);
  const rules = first.valid;

  if (first.invalid.length > 0) {
    // One repair. A rule it does not answer for is checked again as it was.
    const answers = await repairRules(
      first.invalid,
      clauses,
      factSchema,
      meta,
    ).catch((err) => {
      diagnostics.repairError =
        err instanceof Error ? err.message : String(err);
      console.error(err);
      return [];
    });
    const again = first.invalid.map(({ id, draft }) => ({
      id,
      draft: answers.find((answer) => answer.id === id)?.draft ?? draft,
    }));
    const repaired = checkRules(again, clauses, factSchema).valid;
    rules.push(...repaired);

    // What the repair did not fix is kept as unmodeled. The answer can be
    // worse than the rule it was meant to correct, so the rule as it was
    // first written is the fallback.
    for (const [n, original] of first.invalid.entries()) {
      if (repaired.some((rule) => rule.id === original.id)) continue;
      const kept =
        demote(again[n]!, clauses, factSchema) ??
        demote(original, clauses, factSchema);
      if (kept) {
        rules.push(kept);
        diagnostics.demoted.push(kept.id);
      }
    }
    rules.sort((a, b) => a.id.localeCompare(b.id));
  }
  if (rules.length === 0) throw new Error('The clauses gave no rule.');

  return { rules, diagnostics };
}
