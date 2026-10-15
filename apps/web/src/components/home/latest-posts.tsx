import { PostCard } from '@/components/blog/post-card';
import { getT } from '@/i18n/translate';
import { listPosts } from '@/lib/blog';
import { localePath, type Locale } from '@/lib/site';
import { Section } from './section';

export function LatestPosts({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <Section number={8} heading={t('blog.latest')}>
      <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {listPosts(locale)
          .slice(0, 3)
          .map((post) => (
            <PostCard key={post.slug} locale={locale} post={post} />
          ))}
      </div>
      <p className="mt-12 text-sm">
        <a
          href={localePath(locale, '/blog')}
          className="underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {t('blog.all')} →
        </a>
      </p>
    </Section>
  );
}
