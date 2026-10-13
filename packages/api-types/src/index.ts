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
  'terms', // terms of service, terms and conditions
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

const ruleShape = z.object({
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
});

const hasConditionUnlessUnmodeled = (rule: {
  kind: string;
  when: Condition | null;
}) => rule.when !== null || rule.kind === 'unmodeled';
const conditionMissing = {
  path: ['when'],
  message: 'Only an unmodeled rule may have no condition',
};

export const Rule = ruleShape.refine(
  hasConditionUnlessUnmodeled,
  conditionMissing,
);
export type Rule = z.infer<typeof Rule>;

// A rule as the RuleExtractor proposes it. The ID is given by code.
export const RuleDraft = ruleShape
  .omit({ id: true })
  .refine(hasConditionUnlessUnmodeled, conditionMissing);
export type RuleDraft = z.infer<typeof RuleDraft>;

// How a scenario attacks the rules (F-FUZZ-4), in the order they are shown.
export const Strategy = z.enum([
  'baseline',
  'boundary',
  'overlap',
  'definition',
  'procedure',
  'combination',
]);
export type Strategy = z.infer<typeof Strategy>;

export const Scenario = z.object({
  id: z.string(),
  story: z.string(),
  strategy: Strategy,
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

// The Firestore document analyses/{id}/scenarios/{id}. The outcome is there
// once the scenario was run.
export const StoredScenario = Scenario.extend({ outcome: Outcome.optional() });
export type StoredScenario = z.infer<typeof StoredScenario>;

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
  // "ID", "SG", "AU" or anything else. Empty when the Reader found none;
  // NO_COUNTRY once the user has confirmed that there is none to name.
  jurisdiction: z.string(),
  lawChecked: z.boolean(),
  language: z.string(),
  pageCount: z.number().int(),
  unreadablePages: z.array(z.number().int()),
});
export type AnalysisMeta = z.infer<typeof AnalysisMeta>;

// F-UP-1 and F-UP-2. Checked in the browser before uploading and again by
// the API on the real files.
export const UPLOAD_LIMITS = {
  maxBytes: 30 * 1024 * 1024,
  maxPages: 100,
  maxImages: 30,
} as const;

// Countries the legal comparison covers (F-READ-6). Any other jurisdiction
// still gets the scenarios; only the law check is skipped.
export const LAW_JURISDICTIONS = ['ID', 'SG', 'AU'] as const;
export type LawJurisdiction = (typeof LAW_JURISDICTIONS)[number];
export const isLawChecked = (jurisdiction: string) =>
  (LAW_JURISDICTIONS as readonly string[]).includes(jurisdiction);
// The jurisdiction of a document whose country is unknown or not listed.
export const NO_COUNTRY = 'OTHER';

// Why POST /v1/analyses refused the uploaded files (F-UP-1, F-UP-2). Each
// is the `code` of a 400 and has its own message in the dashboard.
export const UploadError = z.enum([
  'file_missing',
  'unsupported_type',
  'mixed_input',
  'too_large',
  'too_many_pages',
]);
export type UploadError = z.infer<typeof UploadError>;

// The states of FSD section 6.
export const AnalysisStatus = z.enum([
  'uploaded',
  'reading',
  'awaiting_confirmation',
  'rejected',
  'extracting_rules',
  'fuzzing',
  'running',
  'comparing',
  'done',
  'failed',
]);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

// The Firestore document analyses/{id}, as far as the dashboard reads it.
export const Analysis = z.object({
  ownerUid: z.string(),
  status: AnalysisStatus,
  stage: AnalysisStatus.optional(), // where a failed run stopped
  error: z.string().optional(),
  meta: AnalysisMeta.nullable(), // null until the document is read
  factSchema: FactSchema.optional(), // from the rules stage on
  counts: z
    .object({
      clauses: z.number().int(),
      rules: z.number().int(),
      scenarios: z.number().int(),
      // Scenarios by the result of their run.
      fine: z.number().int(),
      partlyBad: z.number().int(),
      bad: z.number().int(),
      undetermined: z.number().int(),
    })
    .partial()
    .optional(),
});
export type Analysis = z.infer<typeof Analysis>;

// Both end up in a Storage path, so neither may carry a separator.
export const AnalysisId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const uploadName = z
  .string()
  .max(200)
  .regex(/^[^/\\]+$/)
  .refine((name) => !name.includes('..'));

// Body of POST /v1/analyses. The files are names inside
// uploads/{uid}/{analysisId}/, in page order.
export const CreateAnalysisRequest = z.object({
  analysisId: AnalysisId,
  files: z.array(uploadName).min(1).max(UPLOAD_LIMITS.maxImages),
});
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequest>;

// Body of POST /v1/analyses/:id/confirm.
export const ConfirmAnalysisRequest = z.object({
  docType: DocType,
  jurisdiction: z.string().min(2).max(60),
  userRole: z.string().min(1).max(120),
});
export type ConfirmAnalysisRequest = z.infer<typeof ConfirmAnalysisRequest>;

// What the Reader agent returns. Untrusted until the post-check has run:
// the type is free text here, clause IDs and the page count come from code.
export const ReaderOutput = z.object({
  isPolicyOrContract: z.boolean(),
  docType: z.string(),
  title: z.string(),
  parties: AnalysisMeta.shape.parties,
  jurisdiction: z.string(),
  language: z.string(),
  unreadablePages: z.array(z.number().int()),
  clauses: z.array(Clause.omit({ id: true })),
});
export type ReaderOutput = z.infer<typeof ReaderOutput>;

// Body of every non-2xx API response.
export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    resetAt: z.string().optional(), // with daily_limit: when the limit resets
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
