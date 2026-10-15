import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@repo/ui/components/ui/button';
import { PostCard } from '@/components/blog/post-card';
import { getT } from '@/i18n/translate';
import { POSTS, formatDate, getPost, relatedPosts } from '@/lib/blog';
import { JsonLd, blogPostingLd, breadcrumbsLd, pageMetadata } from '@/lib/seo';
import { APP_URL, LOCALES, isLocale, localePath } from '@/lib/site';

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    POSTS.map((post) => ({ locale, slug: post.slug })),
  );
}

export const dynamicParams = false;

async function load(params: Props['params']) {
  const { locale, slug } = await params;
  const post = isLocale(locale) ? getPost(locale, slug) : undefined;
  if (!post || !isLocale(locale)) notFound();
  return { locale, post };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, post } = await load(params);
  return pageMetadata({
    locale,
    path: `/blog/${post.slug}`,
    title: post.title,
    description: post.description,
    type: 'article',
    publishedTime: post.date,
    modifiedTime: post.updated,
    tags: post.tags,
  });
}

export default async function Article({ params }: Props) {
  const { locale, post } = await load(params);
  const t = getT(locale);
  const { default: Body } = await import(
    `../../../../../content/blog/${locale}/${post.slug}.mdx`
  );
  const crumbs = [
    { name: t('blog.home'), path: localePath(locale) },
    { name: t('blog.kicker'), path: localePath(locale, '/blog') },
    { name: post.title, path: localePath(locale, `/blog/${post.slug}`) },
  ];

  return (
    <main id="main" className="px-4 pb-24 pt-10 md:px-6 md:pt-16">
      <JsonLd data={blogPostingLd(locale, post)} />
      <JsonLd data={breadcrumbsLd(crumbs)} />
      <article className="mx-auto max-w-2xl">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap gap-x-2 font-mono text-xs text-muted-foreground">
            {crumbs.slice(0, -1).map((crumb) => (
              <li key={crumb.path} className="after:ml-2 after:content-['/']">
                <a href={crumb.path} className="hover:text-foreground">
                  {crumb.name}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <header className="mt-8">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {post.tags.map((tag) => t(`blog.tags.${tag}`)).join(' · ')}
          </p>
          <h1 className="mt-4 text-balance font-serif text-4xl leading-[1.08] tracking-tight md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">
            {post.description}
          </p>
          <p className="mt-6 border-y border-border py-3 font-mono text-xs text-muted-foreground">
            {t('blog.byline')} · {t('blog.published')}{' '}
            <time dateTime={post.date}>{formatDate(locale, post.date)}</time>
            {post.updated !== post.date && (
              <>
                {' '}
                · {t('blog.updated')}{' '}
                <time dateTime={post.updated}>
                  {formatDate(locale, post.updated)}
                </time>
              </>
            )}{' '}
            · {t('blog.minutes', { count: post.minutes })}
          </p>
        </header>
        <div className="mt-10 text-[1.0625rem]">
          <Body />
        </div>
        <aside className="mt-16 rounded-xl bg-primary px-6 py-8 text-primary-foreground md:px-10">
          <h2 className="font-serif text-3xl">{t('closing.heading')}</h2>
          <p className="mt-3 max-w-lg opacity-80">{t('blog.checkBody')}</p>
          <Button asChild variant="secondary" size="lg" className="mt-6">
            <a href={APP_URL}>
              {t('cta.check')} <ArrowRight />
            </a>
          </Button>
        </aside>
      </article>
      <section aria-labelledby="related" className="mx-auto mt-24 max-w-6xl">
        <h2 id="related" className="font-serif text-3xl">
          {t('blog.related')}
        </h2>
        <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {relatedPosts(locale, post.slug).map((related) => (
            <PostCard key={related.slug} locale={locale} post={related} />
          ))}
        </div>
      </section>
    </main>
  );
}
