import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@repo/i18n/core';

export type Locale = SupportedLanguage;
export const LOCALES = SUPPORTED_LANGUAGES;
export const DEFAULT_LOCALE = DEFAULT_LANGUAGE;

// Both are inlined at build time; next.config.ts refuses a production build
// without them.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5174';

// Optional: analytics stays off, and no banner shows, without an ID.
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
export const GSC_VERIFICATION = process.env.NEXT_PUBLIC_GSC_VERIFICATION;

export const SITE_NAME = 'safely.ink';
export const CONTACT_EMAIL = 'contact@safely.ink';

export function isLocale(value: string | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? '');
}

/** The public path of a page: English has no prefix, other languages do. */
export function localePath(locale: Locale, path = '/') {
  const rest = path === '/' ? '' : path;
  if (locale === DEFAULT_LOCALE) return rest || '/';
  return `/${locale}${rest}`;
}
