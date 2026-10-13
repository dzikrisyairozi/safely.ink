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
  stake: z.number().nullable(),
  facts: z.record(z.string(), FactValue),
});
export type Scenario = z.infer<typeof Scenario>;

export const Outcome = z.object({
  scenarioId: z.string(),
  result: z.enum(['fine', 'partly_bad', 'bad', 'undetermined']),
  stake: z.number().nullable(),
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
