/**
 * ─────────────────────────────────────────────────────────────────────────────
 * @repo/i18n — React Provider
 *
 * Wraps the app with i18next context.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use client';

import { I18nextProvider } from 'react-i18next';
import type { i18n as I18n } from 'i18next';
import { initI18n, type InitI18nOptions } from './config';
import type { ReactNode } from 'react';

interface I18nProviderProps extends InitI18nOptions {
  children: ReactNode;
  /** An instance from `createI18n`; the shared one from `initI18n` otherwise. */
  instance?: I18n;
}

export function I18nProvider({
  children,
  instance,
  ...options
}: I18nProviderProps) {
  const i18nInstance = instance ?? initI18n(options);

  return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
}
