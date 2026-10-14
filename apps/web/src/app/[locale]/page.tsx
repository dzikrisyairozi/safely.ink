import type { Metadata } from 'next';
import { Closing } from '@/components/home/closing';
import { Comparison } from '@/components/home/comparison';
import { Coverage } from '@/components/home/coverage';
import { Faq, faqItems } from '@/components/home/faq';
import { Hero } from '@/components/home/hero';
import { SampleTrap } from '@/components/home/sample-trap';
import { Steps } from '@/components/home/steps';
import { getT } from '@/i18n/translate';
import {
  JsonLd,
  faqPageLd,
  pageMetadata,
  softwareApplicationLd,
} from '@/lib/seo';
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

  const t = getT(locale);

  return (
    <main id="main">
      <JsonLd data={softwareApplicationLd(locale, t('meta.description'))} />
      <JsonLd data={faqPageLd(faqItems(locale))} />
      <Hero locale={locale} />
      <Steps locale={locale} />
      <SampleTrap locale={locale} />
      <Coverage locale={locale} />
      <Comparison locale={locale} />
      <Faq locale={locale} />
      <Closing locale={locale} />
    </main>
  );
}
