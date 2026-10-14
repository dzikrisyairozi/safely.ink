import { getT } from '@/i18n/translate';
import type { Locale } from '@/lib/site';
import { Glyph } from './glyphs';
import { Section } from './section';

const STEPS = ['read', 'rules', 'fuzz', 'compare'] as const;

export function Steps({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <Section
      id="how"
      number={2}
      heading={t('steps.heading')}
      lead={t('steps.lead')}
    >
      <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step} className="border-t border-foreground/80 pt-5">
            <div className="flex items-start justify-between">
              <p className="font-mono text-sm text-muted-foreground">
                {String(i + 1).padStart(2, '0')}
              </p>
              <Glyph name={step} />
            </div>
            <h3 className="mt-2 font-serif text-2xl">
              {t(`steps.${step}.title`)}
            </h3>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
              {t(`steps.${step}.body`)}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
