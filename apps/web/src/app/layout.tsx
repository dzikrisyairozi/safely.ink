import type { Metadata } from 'next';
import { Geist, Geist_Mono, Newsreader } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { WebI18nProvider } from '@/i18n/client';

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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'safely.ink',
    template: '%s | safely.ink',
  },
  description:
    'Stress-test any policy or contract before you sign. safely.ink finds the scenarios where the fine print leaves you worse off.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'safely.ink',
    title: 'safely.ink',
    description:
      'Stress-test any policy or contract before you sign. safely.ink finds the scenarios where the fine print leaves you worse off.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'safely.ink',
    description:
      'Stress-test any policy or contract before you sign. safely.ink finds the scenarios where the fine print leaves you worse off.',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value === 'id' ? 'id' : 'en';

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${geistMono.variable} ${newsreader.variable} font-sans antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <WebI18nProvider locale={locale}>{children}</WebI18nProvider>
      </body>
    </html>
  );
}
