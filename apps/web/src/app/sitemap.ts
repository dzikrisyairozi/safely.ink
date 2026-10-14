import type { MetadataRoute } from 'next';
import { absoluteUrl, languageAlternates } from '@/lib/seo';
import { LOCALES, localePath } from '@/lib/site';

// Paths without the language prefix; every one exists in every language.
const PAGES = ['/'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((path) => {
    const languages = Object.fromEntries(
      Object.entries(languageAlternates(path)).map(([lang, href]) => [
        lang,
        absoluteUrl(href),
      ]),
    );
    return LOCALES.map((locale) => ({
      url: absoluteUrl(localePath(locale, path)),
      alternates: { languages },
    }));
  });
}
