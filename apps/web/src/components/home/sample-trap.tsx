import { getT } from '@/i18n/translate';
import type { Locale } from '@/lib/site';
import { Section } from './section';

// Laid out like a trap in the report. Red is the reviewer's pen: used here
// because this is a trap, never for buttons or links.
export function SampleTrap({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <Section number={3} heading={t('trap.heading')} lead={t('trap.lead')}>
      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {t('trap.label')}
          </p>
          <span className="rounded-full bg-destructive/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-destructive">
            {t('trap.severity')}
          </span>
        </header>
        <dl className="grid gap-6 px-6 py-6 md:grid-cols-3">
          <div className="md:col-span-3">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('trap.scenarioLabel')}
            </dt>
            <dd className="mt-1 text-pretty font-serif text-xl leading-snug">
              {t('trap.scenario')}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('trap.expectLabel')}
            </dt>
            <dd className="mt-1 text-pretty">{t('trap.expect')}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('trap.outcomeLabel')}
            </dt>
            <dd className="mt-1 font-medium text-destructive">
              {t('trap.outcome')}
            </dd>
          </div>
        </dl>
        <figure className="mx-6 border-l-2 border-destructive pl-4">
          <figcaption className="font-mono text-xs text-muted-foreground">
            {t('trap.clauseLabel')}
          </figcaption>
          <blockquote className="mt-1 text-pretty font-serif italic leading-relaxed">
            “{t('trap.clause')}”
          </blockquote>
        </figure>
        <p className="mx-6 mt-6 overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">
          {t('trap.trace')}
        </p>
        <p className="px-6 pb-6 pt-4 text-xs text-muted-foreground">
          {t('trap.note')}
        </p>
      </article>
    </Section>
  );
}
