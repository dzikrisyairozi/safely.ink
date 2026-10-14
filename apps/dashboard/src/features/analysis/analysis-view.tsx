import { useState, type JSX, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from '@repo/i18n';
import {
  GLOBAL,
  Jurisdiction,
  type Analysis,
  type AnalysisMeta,
  type AnalysisStatus,
  type ConfirmAnalysisRequest,
  type Rule,
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
import { RunTracker } from './run-tracker';

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
  // An analysis from before the pick may hold a country outside the list.
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(
    Jurisdiction.safeParse(meta.jurisdiction).data ?? GLOBAL,
  );
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

// The stage a failed run stopped in, as the key of its message.
const FAILED_AT: Partial<
  Record<AnalysisStatus, 'rules' | 'fuzzing' | 'running' | 'comparing'>
> = {
  extracting_rules: 'rules',
  fuzzing: 'fuzzing',
  running: 'running',
  comparing: 'comparing',
};

/** What `/analyses/$id` shows for each state of an analysis. */
export function AnalysisView({
  id,
  analysis,
  traps,
  rules,
  onConfirm,
}: {
  id: string;
  analysis: Analysis;
  // Live from their sub-collections; empty until the listeners answer.
  traps: Trap[];
  rules: Rule[];
  onConfirm: (details: ConfirmAnalysisRequest) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation('dashboard');

  if (analysis.status === 'awaiting_confirmation' && analysis.meta) {
    return <ConfirmDetails meta={analysis.meta} onConfirm={onConfirm} />;
  }

  const rulesLink = (
    <Link to="/analyses/$id/rules" params={{ id }}>
      {t('analysis.rulesLink')}
    </Link>
  );

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
      // Retry comes with the run screen; until then the way on is to upload.
      const stage = (analysis.stage && FAILED_AT[analysis.stage]) ?? 'reading';
      return (
        <Message
          title={t(`analysis.failed.${stage}.title`)}
          action={<Link to="/">{t('analysis.uploadAgain')}</Link>}
        >
          {t(`analysis.failed.${stage}.description`)}
        </Message>
      );
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
          traps={traps}
          rules={rules}
        />
      );
    case 'done': {
      // The report comes with the run screen; until then the result in words.
      const traps = analysis.counts?.traps ?? 0;
      return (
        <Message
          title={t('analysis.done.title', { grade: analysis.grade })}
          action={rulesLink}
        >
          {[
            traps
              ? t('analysis.done.traps', { count: traps })
              : t('analysis.done.noTraps'),
            analysis.confidence &&
              t(`analysis.done.confidence.${analysis.confidence}`),
            t('analysis.done.next'),
          ]
            .filter(Boolean)
            .join(' ')}
        </Message>
      );
    }
  }
}
