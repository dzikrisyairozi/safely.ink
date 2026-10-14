import type { Metadata } from 'next';
import { Geist, Geist_Mono, Newsreader } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../globals.css';
import { WebI18nProvider } from '@/i18n/client';
import { getT } from '@/i18n/translate';
import { JsonLd, organizationLd, websiteLd } from '@/lib/seo';
import {
  DEFAULT_LOCALE,
  LOCALES,
  SITE_NAME,
  SITE_URL,
  isLocale,
} from '@/lib/site';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
});

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
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${geistMono.variable} ${newsreader.variable} font-sans antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <JsonLd data={organizationLd()} />
        <JsonLd data={websiteLd(locale, getT(locale)('meta.description'))} />
        <WebI18nProvider locale={locale}>{children}</WebI18nProvider>
      </body>
    </html>
  );
}
