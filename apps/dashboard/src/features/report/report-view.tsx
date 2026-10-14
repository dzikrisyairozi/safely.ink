import { Link } from '@tanstack/react-router';
import { useTranslation } from '@repo/i18n';
import {
  GLOBAL,
  GRADE_FORMULA,
  Severity,
  type Analysis,
  type AnalysisMeta,
  type Clause,
  type Rule,
  type StoredFinding,
  type StoredScenario,
  type Trap,
} from '@repo/api-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@repo/ui/components/ui/alert';
import { Button } from '@repo/ui/components/ui/button';
import { useCountryName } from '../../lib/country-name';
import { useRetry } from '../analysis/use-retry';
import { ClauseLinks } from './clause-links';

// The counts of F-REP-1, in the order they are shown.
const COUNTS = [
  'scenarios',
  'fine',
  'partlyBad',
  'bad',
  'undetermined',
  'traps',
] as const;

/** The report at `/analyses/$id` once the analysis is done (F-REP-1 to 8). */
export function ReportView({
  id,
  analysis,
  meta,
  traps,
  rules,
  scenarios,
  clauses,
  findings,
  onRetry,
}: {
  id: string;
  analysis: Analysis;
  meta: AnalysisMeta;
  traps: Trap[];
  rules: Rule[];
  scenarios: StoredScenario[];
  clauses: Clause[];
  findings: StoredFinding[];
  // Checks the law again; resolves when that run has ended.
  onRetry: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation('dashboard');
  const { retry, isStarting, error: retryError } = useRetry(onRetry);
  const countryName = useCountryName();
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const clauseIdsOf = (ruleIds: (string | null)[]) => [
    ...new Set(
      ruleIds.flatMap((ruleId) => ruleById.get(ruleId ?? '')?.clauseIds ?? []),
    ),
  ];

  const otherParty = meta.parties
    .filter((party) => party.role !== meta.userRole)
    .map((party) => party.name)
    .join(', ');
  const facts = [
    ['otherParty', otherParty],
    ['type', t(`analysis.docTypes.${meta.docType}`)],
    ['role', meta.userRole],
    ['country', countryName(meta.jurisdiction)],
    [
      'date',
      analysis.createdAt &&
        new Date(analysis.createdAt.seconds * 1000).toLocaleDateString(
          i18n.language,
          { dateStyle: 'long' },
        ),
    ],
  ] as const;

  const favour = scenarios.filter(
    (scenario) =>
      scenario.strategy === 'baseline' && scenario.outcome?.result === 'fine',
  );
  const unclear = scenarios.filter(
    (scenario) => scenario.outcome?.result === 'undetermined',
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 py-8">
      <Alert>
        <AlertDescription>
          {t('upload.notices.notLegalAdvice')}
        </AlertDescription>
      </Alert>

      <header className="space-y-6">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('report.eyebrow')}
            </p>
            <h1 className="text-3xl tracking-tight">{meta.title}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t('report.grade')}</p>
            <p className="font-mono text-5xl" data-grade>
              {analysis.grade}
            </p>
            {analysis.confidence && (
              <p className="text-xs text-muted-foreground">
                {t(`report.confidence.${analysis.confidence}`)}
              </p>
            )}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {facts.map(
            ([name, value]) =>
              value && (
                <div key={name} className="contents">
                  <dt className="text-muted-foreground">
                    {t(`report.facts.${name}`)}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ),
          )}
        </dl>

        <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {COUNTS.map((name) => (
            <div key={name} className="rounded-md border bg-card px-3 py-2">
              <dt className="text-xs text-muted-foreground">
                {t(`report.counts.${name}`)}
              </dt>
              <dd className="font-mono text-xl">
                {(analysis.counts?.[name] ?? 0).toLocaleString(i18n.language)}
              </dd>
            </div>
          ))}
        </dl>

        <ul className="space-y-1 text-sm text-muted-foreground">
          {meta.docType === 'other' && <li>{t('report.generalAnalysis')}</li>}
          <li>
            {meta.lawChecked
              ? t('report.lawChecked', {
                  country: countryName(meta.jurisdiction),
                })
              : meta.jurisdiction === GLOBAL
                ? t('report.lawGlobal')
                : t('report.lawNotYet', {
                    country: countryName(meta.jurisdiction),
                  })}
          </li>
        </ul>

        {meta.lawChecked && findings.some(({ error }) => error) && (
          <Alert>
            <AlertTitle>{t('report.lawUnavailable.title')}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{t('report.lawUnavailable.description')}</p>
              {retryError && <p className="text-destructive">{retryError}</p>}
              <Button size="sm" disabled={isStarting} onClick={retry}>
                {isStarting
                  ? t('analysis.retry.starting')
                  : t('report.lawUnavailable.button')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {meta.unreadablePages.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>{t('report.incomplete.title')}</AlertTitle>
            <AlertDescription>
              {t('report.incomplete.description', {
                pages: meta.unreadablePages.join(', '),
              })}
            </AlertDescription>
          </Alert>
        )}

        <Button asChild variant="outline" size="sm">
          <Link to="/analyses/$id/rules" params={{ id }}>
            {t('analysis.rulesLink')}
          </Link>
        </Button>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl tracking-tight">{t('report.traps.title')}</h2>
        {traps.length === 0 && (
          <p className="text-muted-foreground">{t('report.traps.none')}</p>
        )}
        {Severity.options.map((severity) => {
          const ofSeverity = traps
            .filter((trap) => trap.severity === severity)
            .sort((a, b) => a.id.localeCompare(b.id));
          if (ofSeverity.length === 0) return null;
          return (
            <div key={severity} className="space-y-2">
              <h3 className="font-mono text-xs uppercase">
                {t(`severity.${severity}`)}
              </h3>
              <ul className="space-y-3">
                {ofSeverity.map((trap) => {
                  const rule = ruleById.get(trap.ruleId);
                  const expected = scenarios.find(
                    (scenario) =>
                      trap.scenarioIds.includes(scenario.id) &&
                      scenario.expectation,
                  )?.expectation;
                  return (
                    <li
                      key={trap.id}
                      className="space-y-2 rounded-md border bg-card p-4"
                    >
                      <Link
                        to="/analyses/$id/traps/$trapId"
                        params={{ id, trapId: trap.id }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {trap.title ?? rule?.summary}
                      </Link>
                      <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                        {expected && (
                          <>
                            <dt className="text-muted-foreground">
                              {t('report.traps.expect')}
                            </dt>
                            <dd>{expected.reason}</dd>
                          </>
                        )}
                        {rule && (
                          <>
                            <dt className="text-muted-foreground">
                              {t('report.traps.says')}
                            </dt>
                            <dd>{rule.summary}</dd>
                          </>
                        )}
                      </dl>
                      <ClauseLinks
                        id={id}
                        clauseIds={rule?.clauseIds ?? []}
                        clauses={clauses}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl tracking-tight">{t('report.favour.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {favour.length > 0
            ? t('report.favour.description')
            : t('report.favour.none')}
        </p>
        <ul className="space-y-2">
          {favour.map((scenario) => (
            <li key={scenario.id} className="space-y-1 rounded-md border p-3">
              <p>{scenario.story}</p>
              <ClauseLinks
                id={id}
                clauseIds={clauseIdsOf(
                  scenario.outcome?.trace.map((step) => step.ruleId) ?? [],
                )}
                clauses={clauses}
              />
            </li>
          ))}
        </ul>
      </section>

      {unclear.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl tracking-tight">
            {t('report.unclear.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('report.unclear.description')}
          </p>
          <ul className="space-y-2">
            {unclear.map((scenario) => {
              const ruleId = scenario.outcome?.decidingRuleId ?? null;
              const rule = ruleById.get(ruleId ?? '');
              return (
                <li
                  key={scenario.id}
                  className="space-y-1 rounded-md border p-3"
                >
                  <p>{scenario.story}</p>
                  {rule && (
                    <p className="text-sm text-muted-foreground">
                      {t('report.unclear.dependsOn', { rule: rule.summary })}
                    </p>
                  )}
                  <ClauseLinks
                    id={id}
                    clauseIds={clauseIdsOf([ruleId])}
                    clauses={clauses}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <details className="rounded-md border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          {t('report.formula.title')}
        </summary>
        <div className="mt-3 space-y-2">
          <p>{t('report.formula.intro')}</p>
          <ul className="list-disc pl-5">
            {Severity.options.map((severity) => (
              <li key={severity}>
                {t('report.formula.penalty', {
                  severity: t(`severity.${severity}`),
                  count: GRADE_FORMULA.penalty[severity],
                })}
              </li>
            ))}
          </ul>
          <p>
            {t('report.formula.bands', {
              bands: GRADE_FORMULA.gradeBands
                .map((band) => `${band.value} ≥ ${band.from}`)
                .join(', '),
            })}
          </p>
          {analysis.points !== undefined && (
            <p>
              {t('report.formula.this', {
                score: analysis.points,
                grade: analysis.grade,
              })}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
