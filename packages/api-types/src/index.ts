import { z } from 'zod';

// Shared contract between the API, the agents' structured output, Firestore
// documents and the UI. This file is the reference; docs/TSD.md section 3
// links here.

export const DocType = z.enum([
  'insurance',
  'loan',
  'employment',
  'nda',
  'lease',
  'other',
]);
export type DocType = z.infer<typeof DocType>;

export const Clause = z.object({
  id: z.string(), // "c-017"
  number: z.string().nullable(),
  heading: z.string().nullable(),
  text: z.string(), // verbatim, original language
  gloss: z.string().nullable(), // English, when the original is not English
  page: z.number().int(),
});
export type Clause = z.infer<typeof Clause>;

const FactValue = z.union([z.number(), z.boolean(), z.string()]);
export type FactValue = z.infer<typeof FactValue>;

// One entry per fact that matters in this document.
export const Fact = z.object({
  key: z.string(), // "daysSinceStart"
  type: z.enum(['number', 'boolean', 'enum']),
  values: z.array(z.string()).nullable(), // for enum
  unit: z.string().nullable(), // "days", "IDR", "%"
  description: z.string(), // plain English
  neutral: FactValue, // value in an uneventful situation
});
export type Fact = z.infer<typeof Fact>;

export const FactSchema = z.array(Fact);
export type FactSchema = z.infer<typeof FactSchema>;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | {
      fact: string;
      op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
      value: FactValue;
    }
  | { fact: string; op: 'in'; value: string[] };

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(Condition) }),
    z.strictObject({ any: z.array(Condition) }),
    z.strictObject({ not: Condition }),
    z.strictObject({
      fact: z.string(),
      op: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte']),
      value: FactValue,
    }),
    z.strictObject({
      fact: z.string(),
      op: z.literal('in'),
      value: z.array(z.string()),
    }),
  ]),
);

export const Rule = z
  .object({
    id: z.string(),
    kind: z.enum([
      'benefit',
      'exclusion',
      'condition',
      'deadline',
      'limit',
      'charge',
      'unmodeled',
    ]),
    summary: z.string(),
    clauseIds: z.array(z.string()).min(1),
    // True means the rule applies. For a benefit that is good for the user;
    // for every other kind it counts against them (breach, deadline missed,
    // exclusion, limit or charge triggered).
    when: Condition.nullable(),
    effect: z
      .object({
        type: z.enum(['grant', 'deny', 'cap', 'deduct', 'charge']),
        amount: z.number().nullable(),
        percent: z.number().nullable(), // of the amount at stake
      })
      .nullable(),
    touches: z.array(z.string()), // fact keys the rule depends on
  })
  .refine((rule) => rule.when !== null || rule.kind === 'unmodeled', {
    path: ['when'],
    message: 'Only an unmodeled rule may have no condition',
  });
export type Rule = z.infer<typeof Rule>;

export const Scenario = z.object({
  id: z.string(),
  story: z.string(),
  strategy: z.enum([
    'baseline',
    'boundary',
    'overlap',
    'definition',
    'procedure',
    'combination',
  ]),
  frequency: z.enum(['common', 'occasional', 'rare']),
  targetRuleIds: z.array(z.string()),
  // Money the user stands to get or keep; null if not about money.
  stake: z.number().nonnegative().nullable(),
  facts: z.record(z.string(), FactValue),
});
export type Scenario = z.infer<typeof Scenario>;

export const Outcome = z.object({
  scenarioId: z.string(),
  result: z.enum(['fine', 'partly_bad', 'bad', 'undetermined']),
  stake: z.number().nonnegative().nullable(),
  loss: z.number(), // unpaid part of the stake plus charges
  decidingRuleId: z.string().nullable(),
  trace: z.array(
    z.object({
      ruleId: z.string(),
      fact: z.string().nullable(),
      note: z.string(),
    }),
  ),
});
export type Outcome = z.infer<typeof Outcome>;

// What a reasonable person in the user's role would expect, judged without
// the fine print.
export const Expectation = z.object({
  result: z.enum(['fine', 'partly_bad', 'bad']),
  reason: z.string(),
});
export type Expectation = z.infer<typeof Expectation>;

export const Citation = z.object({
  instrument: z.string(), // "Insurance Act 1966"
  section: z.string(), // "s 25(5)"
  quote: z.string(), // verbatim from the fetched page
  url: z.url(),
});
export type Citation = z.infer<typeof Citation>;

// What the law says about one deciding rule.
export const LegalFinding = z
  .object({
    status: z.enum(['conflicts', 'restricted', 'permitted', 'no_finding']),
    reasoning: z.string(),
    citations: z.array(Citation),
    error: z.literal('lookup_unavailable').nullable(),
  })
  .refine(
    (finding) =>
      finding.status === 'no_finding' || finding.citations.length > 0,
    { path: ['citations'], message: 'A finding needs at least one citation' },
  );
export type LegalFinding = z.infer<typeof LegalFinding>;

export const Severity = z.enum(['critical', 'high', 'medium', 'low']);
export type Severity = z.infer<typeof Severity>;

export const Grade = z.enum(['A', 'B', 'C', 'D', 'F']);
export type Grade = z.infer<typeof Grade>;

export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

export const Trap = z.object({
  id: z.string(), // "trap-r-004"
  ruleId: z.string(), // the deciding rule the examples share
  scenarioIds: z.array(z.string()).min(1),
  severity: Severity,
  // Written after scoring by a model; the numbers never are.
  title: z.string().nullable(),
  action: z.string().nullable(),
});
export type Trap = z.infer<typeof Trap>;

export const AnalysisMeta = z.object({
  docType: DocType,
  title: z.string(),
  parties: z.array(z.object({ name: z.string(), role: z.string() })),
  userRole: z.string().nullable(), // null until the user confirms
  jurisdiction: z.string(), // "ID", "SG", "AU" or anything else
  lawChecked: z.boolean(),
  language: z.string(),
  pageCount: z.number().int(),
  unreadablePages: z.array(z.number().int()),
});
export type AnalysisMeta = z.infer<typeof AnalysisMeta>;

// Body of every non-2xx API response.
export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
