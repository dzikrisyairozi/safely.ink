'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { I18nProvider } from '@repo/i18n';
import type { Locale } from '@/lib/site';
import { i18nFor } from '@/i18n/translate';

/** Client context for every page: translations in the page's language, theme. */
export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <I18nProvider instance={i18nFor(locale)}>{children}</I18nProvider>
    </ThemeProvider>
  );
}
