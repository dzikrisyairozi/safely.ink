import { Link } from '@tanstack/react-router';
import { Check, Circle, LoaderCircle } from 'lucide-react';
import { useTranslation } from '@repo/i18n';
import { Severity, type Analysis, type Rule, type Trap } from '@repo/api-types';
import { Button } from '@repo/ui/components/ui/button';
import { cn } from '@repo/ui/lib/utils';

// The five stages of FSD F-LIVE-1, and the status in which each one runs.
// Reading is over before the run can be watched.
const STAGES = [
  ['read', 'reading'],
  ['rules', 'extracting_rules'],
  ['fuzz', 'fuzzing'],
  ['run', 'running'],
  ['compare', 'comparing'],
] as const;

export type RunningStatus =
  'extracting_rules' | 'fuzzing' | 'running' | 'comparing';

// The message of each running status, and the count it speaks of.
const MESSAGE = {
  extracting_rules: { key: 'extractingRules', count: null },
  fuzzing: { key: 'fuzzing', count: 'rules' },
  running: { key: 'running', count: 'scenarios' },
  comparing: { key: 'comparing', count: 'scenarios' },
} as const;

const COUNTS = ['clauses', 'rules', 'scenarios', 'traps'] as const;

const bySeverity = (a: Trap, b: Trap) =>
  Severity.options.indexOf(a.severity) - Severity.options.indexOf(b.severity) ||
  a.id.localeCompare(b.id);

/**
 * What `/analyses/$id` shows while the run goes on (F-LIVE-1, F-LIVE-2): the
 * stages, the counts as they grow and the traps as they are written. It
 * follows the listeners, so nothing here needs a reload.
 */
export function RunTracker({
  id,
  analysis,
  status,
  traps,
  rules,
}: {
  id: string;
  analysis: Analysis;
  status: RunningStatus;
  traps: Trap[];
  rules: Rule[];
}) {
  const { t, i18n } = useTranslation('dashboard');
  const current = STAGES.findIndex(([, running]) => running === status);
  const message = MESSAGE[status];
  const summaries = new Map(rules.map((rule) => [rule.id, rule.summary]));
  const counted = COUNTS.filter(
    (name) => analysis.counts?.[name] !== undefined,
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl tracking-tight">
          {t(`analysis.${message.key}.title`)}
        </h1>
        <p className="text-muted-foreground">
          {t(`analysis.${message.key}.description`, {
            count: message.count ? (analysis.counts?.[message.count] ?? 0) : 0,
          })}
        </p>
      </header>

      <ol
        className="grid gap-2 sm:grid-cols-5"
        aria-label={t('run.stages.label')}
      >
        {STAGES.map(([stage], n) => (
          <li
            key={stage}
            aria-current={n === current ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              n === current && 'border-foreground font-medium',
              n > current && 'text-muted-foreground',
            )}
          >
            {n < current && <Check className="size-4" aria-hidden />}
            {n === current && (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            )}
            {n > current && <Circle className="size-4" aria-hidden />}
            {t(`run.stages.${stage}`)}
          </li>
        ))}
      </ol>

      {counted.length > 0 && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {counted.map((name) => (
            <div key={name} className="rounded-md border bg-card px-3 py-2">
              <dt className="text-xs text-muted-foreground">
                {t(`run.counts.${name}`)}
              </dt>
              <dd className="font-mono text-2xl">
                {analysis.counts![name]!.toLocaleString(i18n.language)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {traps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl tracking-tight">{t('run.traps')}</h2>
          <ul className="space-y-2">
            {[...traps].sort(bySeverity).map((trap) => (
              <li
                key={trap.id}
                className="flex items-baseline gap-3 rounded-md border bg-card px-3 py-2"
              >
                <span className="font-mono text-xs uppercase">
                  {t(`severity.${trap.severity}`)}
                </span>
                <span>{trap.title ?? summaries.get(trap.ruleId)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status !== 'extracting_rules' && (
        <Button asChild variant="outline" className="self-start">
          <Link to="/analyses/$id/rules" params={{ id }}>
            {t('analysis.rulesLink')}
          </Link>
        </Button>
      )}
    </div>
  );
}
