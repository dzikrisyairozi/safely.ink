import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { Document } from '@/components/site/document';
import { getT } from '@/i18n/translate';
import {
  DEFAULT_LOCALE,
  LOCALE_HEADER,
  SITE_NAME,
  isLocale,
  localePath,
} from '@/lib/site';

// Every unknown URL lands here. The root layout lives under app/[locale], so a
// not-found.tsx there only rendered after hydration; this page is complete
// HTML. It gets no params: the proxy passes the URL's language as a header.
async function requestLocale() {
  const value = (await headers()).get(LOCALE_HEADER) ?? undefined;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await requestLocale());
  return { title: `${t('notFound.title')} | ${SITE_NAME}` };
}

export default async function GlobalNotFound() {
  const locale = await requestLocale();
  const t = getT(locale);

  return (
    <Document locale={locale}>
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="font-serif text-4xl">{t('notFound.title')}</h1>
        <p className="max-w-md text-muted-foreground">{t('notFound.body')}</p>
        <Link
          href={localePath(locale)}
          className="underline underline-offset-4"
        >
          {t('notFound.home')}
        </Link>
      </main>
    </Document>
  );
}
