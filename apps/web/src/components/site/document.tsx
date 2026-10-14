import type { ReactNode } from 'react';
import { Geist, Geist_Mono, Newsreader } from 'next/font/google';
import '@/app/globals.css';
import { Analytics } from '@/components/site/analytics';
import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';
import { Providers } from '@/i18n/client';
import { GA_ID, type Locale } from '@/lib/site';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

// Small labels only; not worth delaying first paint for.
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  preload: false,
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
});

/** The page around every route, shared by the layout and the 404 page. */
export function Document({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geist.variable} ${geistMono.variable} ${newsreader.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers locale={locale}>
          <Header locale={locale} />
          {children}
          <Footer locale={locale} />
          {GA_ID && <Analytics gaId={GA_ID} />}
        </Providers>
      </body>
    </html>
  );
}
