import { z } from 'zod';
import {
  Fact,
  RuleDraft,
  type Clause,
  type FactSchema,
  type Rule,
} from '@repo/api-types';
import { validateFactSchema, validateRules } from '../engine/validate';

// Facts every document has (TSD 3.2). Defined here, never by the model.
export const BASE_FACTS: FactSchema = [
  {
    key: 'daysSinceStart',
    type: 'number',
    values: null,
    unit: 'days',
    description: 'Days since the agreement started',
    neutral: 0,
  },
  {
    key: 'userPaidOnTime',
    type: 'boolean',
    values: null,
    unit: null,
    description: 'You paid everything you owed on time',
    neutral: true,
  },
  {
    key: 'userGaveNoticeDays',
    type: 'number',
    values: null,
    unit: 'days',
    description: 'Days that passed before you told the other party',
    neutral: 0,
  },
  {
    key: 'userDisclosedEverything',
    type: 'boolean',
    values: null,
    unit: null,
    description: 'You told the other party everything they asked about',
    neutral: true,
  },
  {
    key: 'paperworkComplete',
    type: 'boolean',
    values: null,
    unit: null,
    description: 'You handed in every document that was required',
    neutral: true,
  },
];

// The model is asked for no more facts than this, and no more are kept.
export const MAX_FACTS = 35;
// A fact key becomes a field name of every scenario, and it comes from a
// model that read an untrusted document.
const FACT_KEY = /^[a-z][A-Za-z0-9]*$/;

/**
 * The fact schema of a document: the base facts, then the facts the model
 * proposed that fit their own definition. Pure, like everything here.
 */
export function checkFacts(proposed: unknown[]): FactSchema {
  const taken = new Set(BASE_FACTS.map((fact) => fact.key));
  const own = proposed.flatMap((entry) => {
    const fact = Fact.safeParse(entry);
    if (!fact.success || taken.has(fact.data.key)) return [];
    if (!FACT_KEY.test(fact.data.key)) return [];
    taken.add(fact.data.key);
    return [fact.data];
  });
  const broken = new Set(validateFactSchema(own).map((issue) => issue.id));
  return [
    ...BASE_FACTS,
    ...own.filter((fact) => !broken.has(fact.key)).slice(0, MAX_FACTS),
  ];
}

// A rule as the model returned it, under the ID that code gave it.
export type Proposal = { id: string; draft: unknown };
export type Invalid = Proposal & { issues: string[] };

export const numbered = (drafts: unknown[]): Proposal[] =>
  drafts.map((draft, n) => ({
    id: `r-${String(n + 1).padStart(3, '0')}`,
    draft,
  }));

// The cited clauses that are clauses of the document.
const real = (clauseIds: string[], clauses: Clause[]) =>
  clauseIds.filter((id) => clauses.some((clause) => clause.id === id));

/**
 * Sorts proposed rules into those that can be stored and those to send back
 * with the reason. A rule that cites no clause of the document is in
 * neither (F-RULE-1).
 */
export function checkRules(
  proposals: Proposal[],
  clauses: Clause[],
  factSchema: FactSchema,
): { valid: Rule[]; invalid: Invalid[] } {
  const invalid: Invalid[] = [];
  const candidates: Rule[] = [];

  for (const { id, draft } of proposals) {
    const parsed = RuleDraft.safeParse(draft);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) =>
        [issue.path.join('.'), issue.message].filter(Boolean).join(': '),
      );
      invalid.push({ id, draft, issues });
      continue;
    }
    const clauseIds = real(parsed.data.clauseIds, clauses);
    if (clauseIds.length > 0)
      candidates.push({ ...parsed.data, id, clauseIds });
  }

  const issues = new Map<string, string[]>();
  for (const { id, message } of validateRules(
    candidates,
    clauses,
    factSchema,
  )) {
    issues.set(id, [...(issues.get(id) ?? []), message]);
  }
  const valid = candidates.filter((rule) => !issues.has(rule.id));
  for (const [id, found] of issues) {
    const draft = proposals.find((proposal) => proposal.id === id)!.draft;
    invalid.push({ id, draft, issues: found });
  }
  invalid.sort((a, b) => a.id.localeCompare(b.id));

  return { valid, invalid };
}

// What is left of a rule when its condition is given up.
const Kept = z.object({
  summary: z.string().min(1),
  clauseIds: z.array(z.string()),
  touches: z.array(z.string()).catch([]),
});

/**
 * A rule that could not be made to fit the fact schema: shown to the user
 * as unmodeled, never dropped (F-RULE-3). Null when it has no summary or
 * cites no clause of the document, so there is nothing to show.
 */
export function demote(
  { id, draft }: Proposal,
  clauses: Clause[],
  factSchema: FactSchema,
): Rule | null {
  const kept = Kept.safeParse(draft);
  if (!kept.success) return null;

  const clauseIds = real(kept.data.clauseIds, clauses);
  if (clauseIds.length === 0) return null;

  return {
    id,
    kind: 'unmodeled',
    summary: kept.data.summary,
    clauseIds,
    when: null,
    effect: null,
    touches: kept.data.touches.filter((key) =>
      factSchema.some((fact) => fact.key === key),
    ),
  };
}
