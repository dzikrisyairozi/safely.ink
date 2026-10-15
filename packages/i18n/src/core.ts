/**
 * The React-free part of @repo/i18n: languages, resource merging and a
 * per-language instance factory. Safe to import from React Server Components,
 * where react-i18next cannot load.
 */

import i18next, { type Resource } from 'i18next';

import commonEn from './locales/en/common.json';
import commonId from './locales/id/common.json';

export const SUPPORTED_LANGUAGES = ['en', 'id'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const LANGUAGE_LABELS: Record<
  SupportedLanguage,
  { label: string; flag: string }
> = {
  en: { label: 'English', flag: 'EN' },
  id: { label: 'Bahasa Indonesia', flag: 'ID' },
};

/**
 * Deep-merge app resources with common translations.
 */
export function mergeResources(appResources?: Resource): Resource {
  const base: Resource = {
    en: { common: commonEn },
    id: { common: commonId },
  };

  if (!appResources) return base;

  for (const lang of Object.keys(appResources)) {
    if (!base[lang]) {
      base[lang] = {};
    }
    for (const ns of Object.keys(appResources[lang]!)) {
      const resourceKey = appResources[lang]![ns];
      if (resourceKey) {
        base[lang]![ns] = resourceKey;
      }
    }
  }

  return base;
}

/**
 * A new, ready-to-use instance in one fixed language. For server rendering,
 * where one process renders several languages and the shared instance from
 * `initI18n` would keep whichever language came first. Hand it to
 * `I18nProvider` as `instance` for client components.
 */
export function createI18n({
  lng,
  resources,
  defaultNS = 'common',
}: {
  lng: string;
  resources?: Resource;
  defaultNS?: string;
}) {
  const mergedResources = mergeResources(resources);
  const instance = i18next.createInstance();

  instance.init({
    lng,
    resources: mergedResources,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS,
    ns: Object.keys(mergedResources.en || {}),
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    // Resources are bundled, so `t` works as soon as init returns.
    initAsync: false,
  });

  return instance;
}
