import type { Metadata } from 'next';
import { getT } from '@/i18n/translate';
import { JsonLd, breadcrumbsLd, pageMetadata } from '@/lib/seo';
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from '@/lib/site';

// How it works, Privacy and Terms: one MDX body per language in
// content/pages/<locale>/<page>.mdx, laid out like an article.
export type MdxPageName = 'how-it-works' | 'privacy' | 'terms';
type Params = Promise<{ locale: string }>;

const KEY = {
  'how-it-works': 'pages.howItWorks',
  privacy: 'pages.privacy',
  terms: 'pages.terms',
} as const;

async function localeOf(params: Params): Promise<Locale> {
  const { locale } = await params;
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function mdxPageMetadata(page: MdxPageName) {
  return async ({ params }: { params: Params }): Promise<Metadata> => {
    const locale = await localeOf(params);
    const t = getT(locale);
    return pageMetadata({
      locale,
      path: `/${page}`,
      title: t(`${KEY[page]}.title`),
      description: t(`${KEY[page]}.description`),
    });
  };
}

export function mdxPage(page: MdxPageName) {
  return async function MdxPage({ params }: { params: Params }) {
    const locale = await localeOf(params);
    const t = getT(locale);
    const { default: Body } = await import(
      `../../../content/pages/${locale}/${page}.mdx`
    );
    const title = t(`${KEY[page]}.title`);

    return (
      <main id="main" className="px-4 pb-24 pt-14 md:px-6 md:pt-20">
        <JsonLd
          data={breadcrumbsLd([
            { name: t('blog.home'), path: localePath(locale) },
            { name: title, path: localePath(locale, `/${page}`) },
          ])}
        />
        <article className="mx-auto max-w-2xl">
          <h1 className="text-balance font-serif text-4xl leading-[1.08] tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">
            {t(`${KEY[page]}.description`)}
          </p>
          <div className="mt-10 border-t border-border pt-4 text-[1.0625rem]">
            <Body />
          </div>
        </article>
      </main>
    );
  };
}
