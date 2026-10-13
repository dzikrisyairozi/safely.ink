import { Link } from '@tanstack/react-router';
import { useTranslation } from '@repo/i18n';
import type { Analysis, Clause, FactSchema, Rule } from '@repo/api-types';
import { conditionLines, type ConditionLine } from './condition-text';

// From what the user gets to what can go against them, and last what they
// have to read themselves.
const KINDS: Rule['kind'][] = [
  'benefit',
  'exclusion',
  'condition',
  'deadline',
  'limit',
  'charge',
  'unmodeled',
];

function Condition({ line }: { line: ConditionLine }) {
  const { t } = useTranslation('dashboard');

  if ('join' in line) {
    return (
      <div>
        <span className="text-muted-foreground">
          {t(`rules.join.${line.join}`)}
        </span>
        <ul className="ml-4 list-disc space-y-1 pl-2">
          {line.lines.map((inner, n) => (
            <li key={n}>
              <Condition line={inner} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const value =
    typeof line.value === 'boolean'
      ? t(line.value ? 'rules.yes' : 'rules.no')
      : line.value;
  return (
    <span>
      {line.fact}:{' '}
      <span className="font-medium">{t(`rules.op.${line.op}`, { value })}</span>
    </span>
  );
}

function ClauseLabel({ clause }: { clause: Clause }) {
  const { t } = useTranslation('dashboard');
  return (
    <>
      {clause.number
        ? t('rules.clause', { number: clause.number })
        : t('rules.clauseUnnumbered')}
      {', '}
      {t('rules.page', { page: clause.page })}
    </>
  );
}

function RuleItem({
  rule,
  clauses,
  factSchema,
}: {
  rule: Rule;
  clauses: Clause[];
  factSchema: FactSchema;
}) {
  const { t } = useTranslation('dashboard');
  const cited = clauses.filter((clause) => rule.clauseIds.includes(clause.id));

  return (
    <li className="space-y-2 rounded-md border bg-card p-4">
      <p>{rule.summary}</p>
      {rule.when && (
        <div className="text-sm">
          <p className="text-muted-foreground">{t('rules.appliesWhen')}</p>
          <Condition line={conditionLines(rule.when, factSchema)} />
        </div>
      )}
      <p className="flex flex-wrap gap-x-4 font-mono text-xs">
        {cited.map((clause) => (
          <a key={clause.id} href={`#${clause.id}`} className="underline">
            <ClauseLabel clause={clause} />
          </a>
        ))}
      </p>
    </li>
  );
}

/** "How we read your document" (F-RULE-4): the rules, the facts, the clauses. */
export function RulesView({
  id,
  analysis,
  rules,
  clauses,
}: {
  id: string;
  analysis: Analysis;
  rules: Rule[];
  clauses: Clause[];
}) {
  const { t } = useTranslation('dashboard');
  const factSchema = analysis.factSchema ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 py-8">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">{t('rules.eyebrow')}</p>
        <h1 className="text-3xl tracking-tight">{analysis.meta?.title}</h1>
        <Link to="/analyses/$id" params={{ id }} className="text-sm underline">
          {t('rules.back')}
        </Link>
      </header>

      {rules.length === 0 && (
        <p className="text-muted-foreground">{t('rules.empty')}</p>
      )}

      {KINDS.map((kind) => {
        const ofKind = rules.filter((rule) => rule.kind === kind);
        if (ofKind.length === 0) return null;
        return (
          <section key={kind} className="space-y-3">
            <h2 className="text-xl tracking-tight">
              {t(`rules.kinds.${kind}.title`)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(`rules.kinds.${kind}.description`)}
            </p>
            <ul className="space-y-3">
              {ofKind.map((rule) => (
                <RuleItem
                  key={rule.id}
                  rule={rule}
                  clauses={clauses}
                  factSchema={factSchema}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {factSchema.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl tracking-tight">{t('rules.facts.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('rules.facts.description')}
          </p>
          <ul className="space-y-1 text-sm">
            {factSchema.map((fact) => (
              <li key={fact.key}>
                {fact.description}
                {fact.unit && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {fact.unit}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {clauses.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl tracking-tight">{t('rules.clauses.title')}</h2>
          <ul className="space-y-3">
            {clauses.map((clause) => (
              <li
                key={clause.id}
                id={clause.id}
                className="scroll-mt-4 space-y-2 rounded-md border p-4 target:border-foreground"
              >
                <p className="font-mono text-xs text-muted-foreground">
                  <ClauseLabel clause={clause} />
                  {clause.heading && ` · ${clause.heading}`}
                </p>
                <blockquote className="whitespace-pre-line font-serif">
                  {clause.text}
                </blockquote>
                {clause.gloss && (
                  <p className="text-sm text-muted-foreground">
                    {clause.gloss}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
