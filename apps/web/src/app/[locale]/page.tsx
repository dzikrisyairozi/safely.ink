import type { Metadata } from 'next';
import { Hero } from '@/components/home/hero';
import { SampleTrap } from '@/components/home/sample-trap';
import { Steps } from '@/components/home/steps';
import { getT } from '@/i18n/translate';
import { pageMetadata } from '@/lib/seo';
import { DEFAULT_LOCALE, isLocale } from '@/lib/site';

type Props = { params: Promise<{ locale: string }> };

async function localeOf(params: Props['params']) {
  const { locale } = await params;
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = getT(locale);
  return pageMetadata({
    locale,
    path: '/',
    title: t('meta.title'),
    description: t('meta.description'),
    absoluteTitle: true,
  });
}

export default async function Home({ params }: Props) {
  const locale = await localeOf(params);

  return (
    <main id="main">
      <Hero locale={locale} />
      <Steps locale={locale} />
      <SampleTrap locale={locale} />
    </main>
  );
}
