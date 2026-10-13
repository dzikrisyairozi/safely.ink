import type { Condition, FactSchema } from '@repo/api-types';

type Comparison = Extract<Condition, { fact: string }>;

// A condition in words, as far as that needs no translation. The screen
// words the operators, the joins and yes or no.
export type ConditionLine =
  | { fact: string; op: Comparison['op']; value: string | boolean }
  | { join: 'all' | 'any' | 'not'; lines: ConditionLine[] };

const readable = (option: string) => option.replaceAll('_', ' ');

export function conditionLines(
  condition: Condition,
  factSchema: FactSchema,
): ConditionLine {
  const lines = (conditions: Condition[]) =>
    conditions.map((inner) => conditionLines(inner, factSchema));

  if ('all' in condition) return { join: 'all', lines: lines(condition.all) };
  if ('any' in condition) return { join: 'any', lines: lines(condition.any) };
  if ('not' in condition) return { join: 'not', lines: lines([condition.not]) };

  const fact = factSchema.find((known) => known.key === condition.fact);
  const { op, value } = condition;
  return {
    fact: fact?.description ?? condition.fact,
    op,
    value: Array.isArray(value)
      ? value.map(readable).join(', ')
      : typeof value === 'number'
        ? [value.toLocaleString('en'), fact?.unit].filter(Boolean).join(' ')
        : typeof value === 'string'
          ? readable(value)
          : value,
  };
}
