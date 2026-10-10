import { z } from 'zod';

// Shared contract between the API, the agents' structured output, Firestore
// documents and the UI. Field meanings are specified in docs/TSD.md section 3.

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
  id: z.string(),
  number: z.string().nullable(),
  heading: z.string().nullable(),
  text: z.string(),
  gloss: z.string().nullable(),
  page: z.number().int(),
});
export type Clause = z.infer<typeof Clause>;

const FactValue = z.union([z.number(), z.boolean(), z.string()]);
export type FactValue = z.infer<typeof FactValue>;

export const Fact = z.object({
  key: z.string(),
  type: z.enum(['number', 'boolean', 'enum']),
  values: z.array(z.string()).nullable(),
  unit: z.string().nullable(),
  description: z.string(),
  neutral: FactValue,
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
        percent: z.number().nullable(),
      })
      .nullable(),
    touches: z.array(z.string()),
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
  stake: z.number().nullable(),
  facts: z.record(z.string(), FactValue),
});
export type Scenario = z.infer<typeof Scenario>;

export const Outcome = z.object({
  scenarioId: z.string(),
  result: z.enum(['fine', 'partly_bad', 'bad', 'undetermined']),
  stake: z.number().nullable(),
  loss: z.number(),
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
