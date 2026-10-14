import type { Metadata } from 'next';
import {
  CONTACT_EMAIL,
  DEFAULT_LOCALE,
  LOCALES,
  SITE_NAME,
  SITE_URL,
  localePath,
  type Locale,
} from '@/lib/site';

const OG_LOCALE: Record<Locale, string> = { en: 'en_US', id: 'id_ID' };

export const absoluteUrl = (path: string) => new URL(path, SITE_URL).href;

/** Every language version of a path, plus x-default (English). */
export function languageAlternates(path: string) {
  return {
    ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])),
    'x-default': localePath(DEFAULT_LOCALE, path),
  };
}

type PageMetadata = {
  locale: Locale;
  /** The path without the language prefix, e.g. `/blog/some-post`. */
  path: string;
  title: string;
  description: string;
  /** Use the title as is, without the "| safely.ink" suffix. */
  absoluteTitle?: boolean;
} & (
  | { type?: 'website' }
  | {
      type: 'article';
      publishedTime: string;
      modifiedTime: string;
      tags: string[];
    }
);

/** Canonical, language alternates, Open Graph and Twitter for one page. */
export function pageMetadata(page: PageMetadata): Metadata {
  const { locale, path, title, description } = page;
  const url = localePath(locale, path);
  const article =
    page.type === 'article'
      ? {
          type: 'article' as const,
          publishedTime: page.publishedTime,
          modifiedTime: page.modifiedTime,
          tags: page.tags,
        }
      : { type: 'website' as const };

  return {
    title: page.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      ...article,
      url,
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map(
        (l) => OG_LOCALE[l],
      ),
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/icons/icon-512.png'),
    email: CONTACT_EMAIL,
    contactPoint: {
      '@type': 'ContactPoint',
      email: CONTACT_EMAIL,
      contactType: 'customer support',
      availableLanguage: ['English', 'Indonesian'],
    },
  };
}

export function websiteLd(locale: Locale, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: absoluteUrl(localePath(locale)),
    name: SITE_NAME,
    description,
    inLanguage: locale,
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function breadcrumbsLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function softwareApplicationLd(locale: Locale, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description,
    url: absoluteUrl(localePath(locale)),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: locale,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function faqPageLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}

/** The showreel MP4 and its poster for a language. */
export function reelFiles(locale: Locale) {
  return {
    video: absoluteUrl(`/reel/showreel-${locale}.mp4`),
    poster: absoluteUrl(`/reel/poster-${locale}-wide.jpg`),
    width: 1920,
    height: 1080,
  };
}

export function videoObjectLd(
  locale: Locale,
  { name, description }: { name: string; description: string },
) {
  const reel = reelFiles(locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description,
    thumbnailUrl: reel.poster,
    contentUrl: reel.video,
    duration: 'PT42S',
    uploadDate: '2026-10-14',
    inLanguage: locale,
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/** Structured data as a script tag; `<` is escaped so text cannot close it. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
