import { getT } from '@/i18n/translate';
import type { Locale } from '@/lib/site';
import { Section } from './section';

const TYPES = [
  'insurance',
  'loan',
  'employment',
  'nda',
  'lease',
  'terms',
] as const;
const COUNTRIES = ['id', 'sg', 'au'] as const;

export function Coverage({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <Section number={5} heading={t('coverage.heading')}>
      <div className="grid gap-12 md:grid-cols-2">
        <div>
          <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t('coverage.typesHeading')}
          </h3>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {TYPES.map((type, i) => (
              <li key={type} className="flex items-baseline gap-4 py-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {String.fromCharCode(97 + i)})
                </span>
                <span className="font-serif text-xl">
                  {t(`coverage.types.${type}`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            {t('coverage.general')}
          </p>
        </div>
        <div>
          <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t('coverage.countriesHeading')}
          </h3>
          <ul className="mt-4 grid grid-cols-3 gap-3">
            {COUNTRIES.map((country) => (
              <li
                key={country}
                className="rounded-lg border border-border px-4 py-5"
              >
                <span className="block font-mono text-3xl uppercase tracking-tight">
                  {country}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t(`coverage.countries.${country}`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            {t('coverage.otherCountries')}
          </p>
          <p className="mt-8 rounded-lg bg-muted px-4 py-3 text-sm">
            {t('coverage.notice')}
          </p>
        </div>
      </div>
    </Section>
  );
}
