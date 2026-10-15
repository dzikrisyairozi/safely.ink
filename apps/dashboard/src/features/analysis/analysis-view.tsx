import { useState, type JSX, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from '@repo/i18n';
import {
  GLOBAL,
  Jurisdiction,
  type Analysis,
  type AnalysisMeta,
  type ConfirmAnalysisRequest,
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
import { Input } from '@repo/ui/components/ui/input';
import { DocumentFields } from '../../components/document-fields';
import { useCountryName } from '../../lib/country-name';
import { ReportView } from '../report/report-view';
import { RunTracker, type RunningStatus } from './run-tracker';
import { useRetry } from './use-retry';

function Message({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode; // a link, shown as the button of the message
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 py-16">
      <h1 className="text-3xl tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
      {action && (
        <Button asChild className="self-start">
          {action}
        </Button>
      )}
    </div>
  );
}

function ConfirmDetails({
  meta,
  onConfirm,
}: {
  meta: AnalysisMeta;
  onConfirm: (details: ConfirmAnalysisRequest) => Promise<void>;
}) {
  const { t } = useTranslation('dashboard');
  const [docType, setDocType] = useState(meta.docType);
  const [jurisdiction, setJurisdiction] = useState(meta.jurisdiction);
  const [userRole, setUserRole] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const countryName = useCountryName();

  // What the Reader found, as a choice on this screen: a country outside the
  // list is best described as Global; no country found is no choice at all.
  const { detected } = meta;
  const detectedCountry: Jurisdiction | null = detected.jurisdiction
    ? (Jurisdiction.safeParse(detected.jurisdiction).data ?? GLOBAL)
    : null;
  const typeDiffers = detected.docType !== docType;
  const countryDiffers =
    detectedCountry !== null && detectedCountry !== jurisdiction;

  const submit = async () => {
    setFailed(false);
    setIsSaving(true);
    try {
      await onConfirm({ docType, jurisdiction, userRole });
    } catch {
      setFailed(true);
      setIsSaving(false);
    }
  };

  return (
    <form
      className="mx-auto flex max-w-2xl flex-col gap-6 py-8"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t('analysis.confirm.eyebrow')}
        </p>
        <h1 className="text-3xl tracking-tight">{meta.title}</h1>
        <p className="font-mono text-xs text-muted-foreground">
          {t('analysis.confirm.facts', {
            pages: meta.pageCount,
            language: meta.language.toUpperCase(),
          })}
        </p>
      </header>

      {meta.unreadablePages.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{t('analysis.unreadable.title')}</AlertTitle>
          <AlertDescription>
            {t('analysis.unreadable.description', {
              pages: meta.unreadablePages.join(', '),
            })}{' '}
            <Link to="/" className="underline">
              {t('analysis.uploadAgain')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {(typeDiffers || countryDiffers) && (
        <Alert>
          <AlertTitle>{t('analysis.confirm.mismatch.title')}</AlertTitle>
          <AlertDescription className="space-y-3">
            <ul className="list-disc pl-5">
              {typeDiffers && (
                <li>
                  {t('analysis.confirm.mismatch.type', {
                    type: t(`analysis.docTypes.${detected.docType}`),
                  })}
                </li>
              )}
              {countryDiffers && (
                <li>
                  {t(
                    detectedCountry === GLOBAL
                      ? 'analysis.confirm.mismatch.countryOutside'
                      : 'analysis.confirm.mismatch.country',
                    { country: countryName(detected.jurisdiction) },
                  )}
                </li>
              )}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDocType(detected.docType);
                if (detectedCountry) setJurisdiction(detectedCountry);
              }}
            >
              {t('analysis.confirm.mismatch.use')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <DocumentFields
        docType={docType}
        jurisdiction={jurisdiction}
        onDocType={setDocType}
        onJurisdiction={setJurisdiction}
      />

      {meta.parties.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {t('analysis.confirm.yourRole')}
          </legend>
          {meta.parties.map((party) => (
            <label
              key={`${party.name}-${party.role}`}
              className="flex cursor-pointer items-center gap-3 rounded-md border bg-card px-3 py-2 has-checked:border-foreground"
            >
              <input
                type="radio"
                name="userRole"
                className="accent-foreground"
                checked={userRole === party.role}
                onChange={() => setUserRole(party.role)}
              />
              <span className="flex-1">{party.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {party.role}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <label className="space-y-1.5 text-sm font-medium">
          {t('analysis.confirm.yourRole')}
          <Input
            value={userRole}
            placeholder={t('analysis.confirm.rolePlaceholder')}
            onChange={(event) => setUserRole(event.target.value)}
          />
        </label>
      )}

      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{t('analysis.confirm.failed')}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="self-start"
        disabled={!userRole.trim() || isSaving}
      >
        {t('analysis.confirm.submit')}
      </Button>
    </form>
  );
}

function RetryStage({
  stage,
  onRetry,
}: {
  stage: RunningStatus; // where the failed run stopped
  onRetry: () => Promise<void>;
}) {
  const { t } = useTranslation('dashboard');
  const { retry, isStarting, error } = useRetry(onRetry);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 py-16">
      <h1 className="text-3xl tracking-tight">
        {t(`analysis.failed.${stage}.title`)}
      </h1>
      <p className="text-muted-foreground">
        {t(`analysis.failed.${stage}.description`)}
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button className="self-start" disabled={isStarting} onClick={retry}>
        {isStarting ? t('analysis.retry.starting') : t('analysis.retry.button')}
      </Button>
    </div>
  );
}

/** What `/analyses/$id` shows for each state of an analysis. */
export function AnalysisView({
  id,
  analysis,
  traps,
  rules,
  scenarios,
  clauses,
  findings,
  onConfirm,
  onRetry,
}: {
  id: string;
  analysis: Analysis;
  // Live from their sub-collections; undefined until the listeners answer.
  traps: Trap[] | undefined;
  rules: Rule[] | undefined;
  scenarios: StoredScenario[] | undefined;
  clauses: Clause[] | undefined;
  findings: StoredFinding[] | undefined;
  onConfirm: (details: ConfirmAnalysisRequest) => Promise<void>;
  // Resolves when the run it starts has ended; the screen follows the status.
  onRetry: () => Promise<void>;
}): JSX.Element | null {
  const { t } = useTranslation('dashboard');

  if (analysis.status === 'awaiting_confirmation' && analysis.meta) {
    return <ConfirmDetails meta={analysis.meta} onConfirm={onConfirm} />;
  }

  switch (analysis.status) {
    case 'uploaded':
    case 'reading':
    case 'awaiting_confirmation': // the details are not stored yet
      return (
        <Message title={t('analysis.reading.title')}>
          {t('analysis.reading.description')}
        </Message>
      );
    case 'rejected':
      return (
        <Message
          title={t('analysis.rejected.title')}
          action={<Link to="/">{t('analysis.uploadAnother')}</Link>}
        >
          {t('analysis.rejected.description')}
        </Message>
      );
    case 'failed': {
      const { stage } = analysis;
      // A failed reading stored nothing to resume from: upload again.
      if (!stage || stage === 'reading') {
        return (
          <Message
            title={t('analysis.failed.reading.title')}
            action={<Link to="/">{t('analysis.uploadAgain')}</Link>}
          >
            {t('analysis.failed.reading.description')}
          </Message>
        );
      }
      return <RetryStage stage={stage} onRetry={onRetry} />;
    }
    case 'extracting_rules':
    case 'fuzzing':
    case 'running':
    case 'comparing':
      return (
        <RunTracker
          id={id}
          analysis={analysis}
          status={analysis.status}
          traps={traps ?? []}
          rules={rules ?? []}
        />
      );
    case 'done':
      // A report without its traps would say there are none.
      if (!traps || !rules || !scenarios || !clauses) return null;
      // Done always has its details; without them there is nothing to show.
      return analysis.meta ? (
        <ReportView
          id={id}
          analysis={analysis}
          meta={analysis.meta}
          traps={traps}
          rules={rules}
          scenarios={scenarios}
          clauses={clauses}
          // The law is a part of the report, not a reason to wait for it.
          findings={findings ?? []}
          onRetry={onRetry}
        />
      ) : (
        <Message title={t('analysis.reading.title')}>
          {t('analysis.reading.description')}
        </Message>
      );
  }
}
