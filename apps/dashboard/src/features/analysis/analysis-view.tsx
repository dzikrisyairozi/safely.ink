import { useState, type JSX, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from '@repo/i18n';
import {
  DocType,
  LAW_JURISDICTIONS,
  NO_COUNTRY,
  isLawChecked,
  type Analysis,
  type AnalysisMeta,
  type AnalysisStatus,
  type ConfirmAnalysisRequest,
} from '@repo/api-types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@repo/ui/components/ui/alert';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';

const FIELD =
  'h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
  const { t, i18n } = useTranslation('dashboard');
  const [docType, setDocType] = useState(meta.docType);
  const [jurisdiction, setJurisdiction] = useState(
    meta.jurisdiction || NO_COUNTRY,
  );
  const [userRole, setUserRole] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const countries = new Intl.DisplayNames([i18n.language], { type: 'region' });
  const countryName = (code: string) => {
    if (code === NO_COUNTRY) return t('analysis.confirm.otherCountry');
    try {
      return countries.of(code) ?? code;
    } catch {
      return code; // not a region code; show what the document said
    }
  };
  const jurisdictions = [
    ...new Set([...LAW_JURISDICTIONS, jurisdiction, NO_COUNTRY]),
  ];

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

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          {t('analysis.confirm.docType')}
          <select
            className={FIELD}
            value={docType}
            onChange={(event) => setDocType(DocType.parse(event.target.value))}
          >
            {DocType.options.map((type) => (
              <option key={type} value={type}>
                {t(`analysis.docTypes.${type}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm font-medium">
          {t('analysis.confirm.jurisdiction')}
          <select
            className={FIELD}
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value)}
          >
            {jurisdictions.map((code) => (
              <option key={code} value={code}>
                {countryName(code)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {docType === 'other' && (
        <p className="text-sm text-muted-foreground">
          {t('analysis.confirm.generalAnalysis')}
        </p>
      )}
      {!isLawChecked(jurisdiction) && (
        <p className="text-sm text-muted-foreground">
          {t('analysis.confirm.lawSkipped', {
            country: countryName(jurisdiction),
          })}
        </p>
      )}

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
  onConfirm,
}: {
  id: string;
  analysis: Analysis;
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
      return (
        <Message title={t('analysis.extractingRules.title')}>
          {t('analysis.extractingRules.description')}
        </Message>
      );
    case 'fuzzing':
      return (
        <Message title={t('analysis.fuzzing.title')} action={rulesLink}>
          {t('analysis.fuzzing.description', {
            count: analysis.counts?.rules ?? 0,
          })}
        </Message>
      );
    case 'running':
      return (
        <Message title={t('analysis.running.title')} action={rulesLink}>
          {t('analysis.running.description', {
            count: analysis.counts?.scenarios ?? 0,
          })}
        </Message>
      );
    case 'comparing':
      return (
        <Message title={t('analysis.comparing.title')} action={rulesLink}>
          {t('analysis.comparing.description', {
            count: analysis.counts?.scenarios ?? 0,
          })}
        </Message>
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
