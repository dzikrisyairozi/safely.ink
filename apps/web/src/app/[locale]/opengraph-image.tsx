import { getT } from '@/i18n/translate';
import { OG_SIZE, ogImage } from '@/lib/og';
import { LOCALES, isLocale, DEFAULT_LOCALE } from '@/lib/site';

export const alt = 'safely.ink';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getT(isLocale(locale) ? locale : DEFAULT_LOCALE);
  return ogImage({ kicker: t('og.kicker'), title: t('hero.title') });
}
