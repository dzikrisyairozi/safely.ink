import { GLOBAL } from '@repo/api-types';
import { useTranslation } from '@repo/i18n';

/** The name of a country code, or of Global, in the UI language. */
export function useCountryName() {
  const { t, i18n } = useTranslation('dashboard');
  const names = new Intl.DisplayNames([i18n.language], { type: 'region' });
  return (code: string) => {
    if (code === GLOBAL) return t('document.global');
    try {
      return names.of(code) ?? code;
    } catch {
      return code; // not a region code; show what the document said
    }
  };
}
