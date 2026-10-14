import { getT } from '@/i18n/translate';
import type { Locale } from '@/lib/site';
import { Section } from './section';

const ROWS = [
  'output',
  'method',
  'repeatable',
  'explainable',
  'grounding',
] as const;

export function Comparison({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <Section
      number={6}
      heading={t('comparison.heading')}
      lead={t('comparison.lead')}
    >
      <table className="w-full table-fixed border-collapse text-left text-sm md:text-base">
        <caption className="sr-only">{t('comparison.heading')}</caption>
        <thead>
          <tr className="border-b border-foreground/80">
            <td className="w-[22%] py-3" />
            <th
              scope="col"
              className="py-3 pr-4 font-normal text-muted-foreground"
            >
              {t('comparison.summariser')}
            </th>
            <th scope="col" className="py-3 font-serif text-lg font-normal">
              {t('comparison.us')}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row} className="border-b border-border align-top">
              <th
                scope="row"
                className="py-4 pr-4 font-mono text-xs font-normal uppercase tracking-wider text-muted-foreground"
              >
                {t(`comparison.rows.${row}.label`)}
              </th>
              <td className="py-4 pr-4 text-muted-foreground">
                {t(`comparison.rows.${row}.them`)}
              </td>
              <td className="py-4">{t(`comparison.rows.${row}.us`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
