import type { MetadataRoute } from 'next';
import { POSTS } from '@/lib/blog';
import { absoluteUrl, languageAlternates } from '@/lib/seo';
import { LOCALES, localePath } from '@/lib/site';

// Paths without the language prefix; every one exists in every language.
const PAGES: { path: string; lastModified?: string }[] = [
  { path: '/' },
  { path: '/how-it-works' },
  { path: '/blog' },
  { path: '/privacy' },
  { path: '/terms' },
  ...POSTS.map((post) => ({
    path: `/blog/${post.slug}`,
    lastModified: post.updated,
  })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap(({ path, lastModified }) => {
    const languages = Object.fromEntries(
      Object.entries(languageAlternates(path)).map(([lang, href]) => [
        lang,
        absoluteUrl(href),
      ]),
    );
    return LOCALES.map((locale) => ({
      url: absoluteUrl(localePath(locale, path)),
      ...(lastModified && { lastModified }),
      alternates: { languages },
    }));
  });
}
