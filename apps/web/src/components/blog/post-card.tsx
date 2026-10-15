import { getT } from '@/i18n/translate';
import { formatDate, type PostSummary } from '@/lib/blog';
import { localePath, type Locale } from '@/lib/site';

export function PostCard({
  locale,
  post,
}: {
  locale: Locale;
  post: PostSummary;
}) {
  const t = getT(locale);

  return (
    <article className="group relative flex h-full flex-col border-t border-foreground/80 pt-5">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {post.tags.map((tag) => t(`blog.tags.${tag}`)).join(' · ')}
      </p>
      <h3 className="mt-3 text-balance font-serif text-2xl leading-snug">
        <a
          href={localePath(locale, `/blog/${post.slug}`)}
          className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-border group-hover:underline-offset-4"
        >
          {post.title}
        </a>
      </h3>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
        {post.description}
      </p>
      <p className="mt-auto pt-4 font-mono text-xs text-muted-foreground">
        <time dateTime={post.date}>{formatDate(locale, post.date)}</time> ·{' '}
        {t('blog.minutes', { count: post.minutes })}
      </p>
    </article>
  );
}
