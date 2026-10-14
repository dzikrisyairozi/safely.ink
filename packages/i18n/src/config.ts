/**
 * ─────────────────────────────────────────────────────────────────────────────
 * @repo/i18n — Shared i18n Configuration
 *
 * Factory function to initialize i18next with common translations
 * and app-specific resources.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import i18n, { type InitOptions, type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { DEFAULT_LANGUAGE, mergeResources } from './core';

export {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_LABELS,
  createI18n,
  type SupportedLanguage,
} from './core';

export interface InitI18nOptions {
  /** Initial language (e.g., from server cookie). Overrides auto-detection. */
  lng?: string;
  /** App-specific translation resources */
  resources?: Resource;
  /** Default namespace for the app */
  defaultNS?: string;
  /** Whether to use browser language detection (default: true) */
  detection?: boolean;
}

let initialized = false;

export function initI18n(options: InitI18nOptions = {}) {
  if (initialized) return i18n;

  const { lng, resources, defaultNS = 'common', detection = true } = options;

  const mergedResources = mergeResources(resources);

  const config: InitOptions = {
    resources: mergedResources,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS,
    ns: Object.keys(mergedResources.en || {}),
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
  };

  // If a specific language is provided (e.g., from server cookie), use it
  if (lng) {
    config.lng = lng;
  }

  // Use browser detection for SPAs (dashboard), skip for SSR (web)
  if (detection && !lng) {
    i18n.use(LanguageDetector);
  }

  i18n.use(initReactI18next);
  i18n.init(config);

  initialized = true;
  return i18n;
}

/**
 * Reset the initialized state (useful for testing or HMR).
 */
export function resetI18n() {
  initialized = false;
}

export { i18n };
