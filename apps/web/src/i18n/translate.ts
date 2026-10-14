import { createI18n, type SupportedLanguage } from '@repo/i18n/core';
import en from './locales/en.json';
import id from './locales/id.json';

const resources = { en: { web: en }, id: { web: id } };

// One instance per language, never switched: the server renders both
// languages in the same process, and a shared instance would leak between them.
const instances = {
  en: createI18n({ lng: 'en', resources, defaultNS: 'web' }),
  id: createI18n({ lng: 'id', resources, defaultNS: 'web' }),
} satisfies Record<SupportedLanguage, unknown>;

export function i18nFor(locale: SupportedLanguage) {
  return instances[locale];
}

export function getT(locale: SupportedLanguage) {
  return i18nFor(locale).getFixedT(locale, 'web');
}
