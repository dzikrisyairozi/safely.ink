import type { Metadata } from 'next';
import { PostCard } from '@/components/blog/post-card';
import { getT } from '@/i18n/translate';
import { listPosts } from '@/lib/blog';
import { JsonLd, breadcrumbsLd, pageMetadata } from '@/lib/seo';
import { DEFAULT_LOCALE, isLocale, localePath } from '@/lib/site';

type Props = { params: Promise<{ locale: string }> };

async function localeOf(params: Props['params']) {
  const { locale } = await params;
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params);
  const t = getT(locale);
  const meta = pageMetadata({
    locale,
    path: '/blog',
    title: t('blog.title'),
    description: t('blog.description'),
  });
  return {
    ...meta,
    alternates: {
      ...meta.alternates,
      types: { 'application/rss+xml': localePath(locale, '/blog/feed') },
    },
  };
}

export default async function BlogIndex({ params }: Props) {
  const locale = await localeOf(params);
  const t = getT(locale);
  const posts = listPosts(locale);

  return (
    <main
      id="main"
      className="mx-auto max-w-6xl px-4 pb-24 pt-14 md:px-6 md:pt-20"
    >
      <JsonLd
        data={breadcrumbsLd([
          { name: t('blog.home'), path: localePath(locale) },
          { name: t('blog.kicker'), path: localePath(locale, '/blog') },
        ])}
      />
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {t('blog.kicker')}
      </p>
      <h1 className="mt-4 max-w-3xl text-balance font-serif text-5xl leading-[1.05] tracking-tight md:text-6xl">
        {t('blog.title')}
      </h1>
      <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
        {t('blog.description')}
      </p>
      <div className="mt-16 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard key={post.slug} locale={locale} post={post} />
        ))}
      </div>
      <p className="mt-16 text-sm">
        <a
          href={localePath(locale, '/blog/feed')}
          className="underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {t('blog.feed')}
        </a>
      </p>
    </main>
  );
}
