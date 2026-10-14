import { Link } from '@tanstack/react-router';
import { useTranslation } from '@repo/i18n';
import type {
  Analysis,
  Clause,
  FactSchema,
  Rule,
  StoredScenario,
  Trap,
} from '@repo/api-types';
import { ClauseLabel } from '../rules/rules-view';
import { ClauseLinks } from './clause-links';

// No currency is stored on an analysis. The rule writer gives money facts the
// currency code as their unit, so the first such unit is the document's.
const currencyOf = (factSchema: FactSchema) =>
  factSchema.find((fact) => fact.unit && /^[A-Z]{3}$/.test(fact.unit))?.unit;

function money(amount: number, language: string, currency?: string | null) {
  try {
    return amount.toLocaleString(
      language,
      currency ? { style: 'currency', currency } : undefined,
    );
  } catch {
    return amount.toLocaleString(language); // not a currency Intl knows
  }
}

/** One trap at `/analyses/$id/traps/$trapId` (F-REP-3, F-REP-4). */
export function TrapView({
  id,
  analysis,
  trap,
  rules,
  scenarios,
  clauses,
}: {
  id: string;
  analysis: Analysis;
  trap: Trap;
  rules: Rule[];
  scenarios: StoredScenario[];
  clauses: Clause[];
}) {
  const { t, i18n } = useTranslation('dashboard');
  const factSchema = analysis.factSchema ?? [];
  const currency = currencyOf(factSchema);
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const rule = ruleById.get(trap.ruleId);
  const examples = scenarios.filter((scenario) =>
    trap.scenarioIds.includes(scenario.id),
  );
  const factDescription = (key: string) =>
    factSchema.find((fact) => fact.key === key)?.description ?? key;
  const cited = clauses.filter((clause) => rule?.clauseIds.includes(clause.id));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 py-8">
      <header className="space-y-2">
        <Link to="/analyses/$id" params={{ id }} className="text-sm underline">
          {t('trap.back')}
        </Link>
        <p className="font-mono text-xs uppercase">
          {t(`severity.${trap.severity}`)}
        </p>
        <h1 className="text-3xl tracking-tight">
          {trap.title ?? rule?.summary}
        </h1>
      </header>

      {trap.action && (
        <section className="space-y-2 rounded-md border bg-card p-4">
          <h2 className="text-xl tracking-tight">{t('trap.action')}</h2>
          <p className="whitespace-pre-line">{trap.action}</p>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl tracking-tight">{t('trap.examples')}</h2>
        {examples.map((scenario) => (
          <article
            key={scenario.id}
            className="space-y-4 rounded-md border p-4"
          >
            <p>{scenario.story}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {t(`trap.frequency.${scenario.frequency}`)}
            </p>

            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              {scenario.outcome && (
                <>
                  <dt className="text-muted-foreground">{t('trap.outcome')}</dt>
                  <dd>{t(`trap.result.${scenario.outcome.result}`)}</dd>
                  {scenario.outcome.stake !== null && (
                    <>
                      <dt className="text-muted-foreground">
                        {t('trap.stake')}
                      </dt>
                      <dd className="font-mono">
                        {money(scenario.outcome.stake, i18n.language, currency)}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{t('trap.loss')}</dt>
                  <dd className="font-mono">
                    {money(scenario.outcome.loss, i18n.language, currency)}
                  </dd>
                </>
              )}
              {scenario.expectation && (
                <>
                  <dt className="text-muted-foreground">
                    {t('trap.expected')}
                  </dt>
                  <dd>
                    {t(`trap.result.${scenario.expectation.result}`)}.{' '}
                    {scenario.expectation.reason}
                  </dd>
                </>
              )}
            </dl>

            {scenario.outcome && scenario.outcome.trace.length > 0 && (
              <div className="space-y-2 text-sm">
                <h3 className="font-medium">{t('trap.trace')}</h3>
                <ol className="list-decimal space-y-2 pl-5">
                  {scenario.outcome.trace.map((step, n) => {
                    const applied = ruleById.get(step.ruleId);
                    return (
                      <li key={n} className="space-y-1">
                        <p>{applied?.summary ?? step.ruleId}</p>
                        {step.fact && (
                          <p className="text-muted-foreground">
                            {t('trap.because', {
                              fact: factDescription(step.fact),
                            })}
                          </p>
                        )}
                        <ClauseLinks
                          id={id}
                          clauseIds={applied?.clauseIds ?? []}
                          clauses={clauses}
                        />
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </article>
        ))}
      </section>

      {cited.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl tracking-tight">{t('trap.clause')}</h2>
          {cited.map((clause) => (
            <figure key={clause.id} className="space-y-2 rounded-md border p-4">
              <figcaption className="font-mono text-xs text-muted-foreground">
                <Link
                  to="/analyses/$id/rules"
                  params={{ id }}
                  hash={clause.id}
                  className="underline"
                >
                  <ClauseLabel clause={clause} />
                </Link>
                {clause.heading && ` · ${clause.heading}`}
              </figcaption>
              <blockquote className="whitespace-pre-line font-serif">
                {clause.text}
              </blockquote>
              {clause.gloss && (
                <p className="text-sm text-muted-foreground">{clause.gloss}</p>
              )}
            </figure>
          ))}
        </section>
      )}
    </div>
  );
}
