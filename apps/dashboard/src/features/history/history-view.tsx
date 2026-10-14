import { Link } from '@tanstack/react-router';
import { useTranslation } from '@repo/i18n';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { useCountryName } from '../../lib/country-name';
import { DeleteAnalysis } from './delete-analysis';
import type { HistoryEntry } from './use-history';

/** The user's analyses at `/history`, in the order given (F-HIST-1). */
export function HistoryView({ entries }: { entries: HistoryEntry[] }) {
  const { t } = useTranslation('dashboard');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <h1 className="text-3xl tracking-tight">{t('history.title')}</h1>
      {entries.length === 0 ? (
        <div className="space-y-4">
          <p className="text-muted-foreground">{t('history.empty')}</p>
          <Button asChild>
            <Link to="/">{t('history.start')}</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y">
          {entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { t, i18n } = useTranslation('dashboard');
  const countryName = useCountryName();
  const { meta, createdAt } = entry;

  // An analysis that was never read (rejected, or failed while reading) has
  // no details, only its date; one that could not be listed has neither.
  const details = [
    meta && t(`analysis.docTypes.${meta.docType}`),
    meta && countryName(meta.jurisdiction),
    createdAt &&
      new Date(createdAt.seconds * 1000).toLocaleDateString(i18n.language, {
        dateStyle: 'medium',
      }),
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-4 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          to="/analyses/$id"
          params={{ id: entry.id }}
          className="block truncate font-medium hover:underline"
        >
          {meta?.title ?? t('history.untitled')}
        </Link>
        <p className="text-sm text-muted-foreground">{details.join(' · ')}</p>
      </div>
      {entry.status && (
        <Badge variant="outline">{t(`history.status.${entry.status}`)}</Badge>
      )}
      <span className="w-8 text-center font-mono text-2xl">
        {entry.grade ?? '–'}
      </span>
      <DeleteAnalysis id={entry.id} analysis={entry} />
    </li>
  );
}
