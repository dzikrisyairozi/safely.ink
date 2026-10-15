import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Document } from '@/components/site/document';
import { getT } from '@/i18n/translate';
import { JsonLd, organizationLd, websiteLd } from '@/lib/seo';
import {
  DEFAULT_LOCALE,
  GSC_VERIFICATION,
  LOCALES,
  SITE_NAME,
  SITE_URL,
  isLocale,
} from '@/lib/site';

// Defaults for every page; each page adds its own canonical and alternates
// through pageMetadata().
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getT(isLocale(locale) ? locale : DEFAULT_LOCALE);
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: { default: t('meta.title'), template: `%s | ${SITE_NAME}` },
    description: t('meta.description'),
    openGraph: { siteName: SITE_NAME, type: 'website' },
    twitter: { card: 'summary_large_image' },
    ...(GSC_VERIFICATION && { verification: { google: GSC_VERIFICATION } }),
  };
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <Document locale={locale}>
      <JsonLd data={organizationLd()} />
      <JsonLd data={websiteLd(locale, getT(locale)('meta.description'))} />
      {children}
    </Document>
  );
}
