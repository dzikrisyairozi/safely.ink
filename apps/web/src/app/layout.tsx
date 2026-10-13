import type { Metadata } from 'next';
import { Outfit, Instrument_Serif } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { WebI18nProvider } from '@/i18n/client';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
});

const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: 'italic',
  subsets: ['latin'],
  variable: '--font-instrument',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'Policy Police',
    template: '%s | Policy Police',
  },
  description:
    'Stress-test any policy or contract before you sign. Policy Police finds the scenarios where the fine print leaves you worse off.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'Policy Police',
    title: 'Policy Police',
    description:
      'Stress-test any policy or contract before you sign. Policy Police finds the scenarios where the fine print leaves you worse off.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Policy Police',
    description:
      'Stress-test any policy or contract before you sign. Policy Police finds the scenarios where the fine print leaves you worse off.',
  },
  icons: {
    icon: '/favicon/favicon.ico',
    apple: '/favicon/apple-icon-180x180.png',
  },
  manifest: '/favicon/manifest.json',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'en';

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${instrumentSerif.variable} font-sans antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <WebI18nProvider locale={locale}>{children}</WebI18nProvider>
      </body>
    </html>
  );
}
