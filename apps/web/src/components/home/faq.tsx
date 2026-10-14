import { Plus } from 'lucide-react';
import { getT } from '@/i18n/translate';
import type { Locale } from '@/lib/site';
import { Section } from './section';

export const FAQ_KEYS = [
  'advice',
  'documents',
  'countries',
  'time',
  'decides',
  'citations',
  'privacy',
  'account',
] as const;

export function faqItems(locale: Locale) {
  const t = getT(locale);
  return FAQ_KEYS.map((key) => ({
    question: t(`faq.items.${key}.q`),
    answer: t(`faq.items.${key}.a`),
  }));
}

export function Faq({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <Section number={7} heading={t('faq.heading')}>
      <div className="max-w-3xl divide-y divide-border border-y border-border">
        {faqItems(locale).map(({ question, answer }) => (
          <details key={question} className="group py-1">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-4 font-serif text-xl [&::-webkit-details-marker]:hidden">
              <h3>{question}</h3>
              <Plus
                aria-hidden
                className="mt-1.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
              />
            </summary>
            <p className="pb-5 text-pretty leading-relaxed text-muted-foreground">
              {answer}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
