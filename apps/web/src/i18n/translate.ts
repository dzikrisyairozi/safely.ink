import { createI18n, type SupportedLanguage } from '@repo/i18n/config';
import en from './locales/en.json';
import id from './locales/id.json';

const resources = { en: { web: en }, id: { web: id } };

// One instance per language, never switched: the server renders both
// languages in the same process, and a shared instance would leak between them.
const instances = new Map<SupportedLanguage, ReturnType<typeof createI18n>>();

export function i18nFor(locale: SupportedLanguage) {
  let instance = instances.get(locale);
  if (!instance) {
    instance = createI18n({ lng: locale, resources, defaultNS: 'web' });
    instances.set(locale, instance);
  }
  return instance;
}

export function getT(locale: SupportedLanguage) {
  return i18nFor(locale).getFixedT(locale, 'web');
}
