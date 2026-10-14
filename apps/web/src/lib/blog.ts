import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSTS, type Post } from '../../content/blog/posts';
import type { Locale } from '@/lib/site';

const CONTENT = join(process.cwd(), 'content/blog');

/** The article's MDX source. */
export function postSource(locale: Locale, slug: string) {
  return readFileSync(join(CONTENT, locale, `${slug}.mdx`), 'utf8');
}

export function readingMinutes(text: string) {
  return Math.max(
    1,
    Math.round(text.split(/\s+/).filter(Boolean).length / 220),
  );
}

/** The article as plain text, for llms-full.txt and RSS. */
export function plainText(markdown: string) {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

function summary(post: Post, locale: Locale) {
  return {
    slug: post.slug,
    date: post.date,
    updated: post.updated,
    tags: post.tags,
    ...post[locale],
    minutes: readingMinutes(postSource(locale, post.slug)),
  };
}

export type PostSummary = ReturnType<typeof summary>;

/** Newest first. */
export function listPosts(locale: Locale) {
  return [...POSTS]
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
    )
    .map((post) => summary(post, locale));
}

export function getPost(locale: Locale, slug: string) {
  const post = POSTS.find((p) => p.slug === slug);
  return post && summary(post, locale);
}

/** Up to three other articles, those sharing a tag first. */
export function relatedPosts(locale: Locale, slug: string) {
  const tags = POSTS.find((p) => p.slug === slug)?.tags ?? [];
  const others = listPosts(locale).filter((p) => p.slug !== slug);
  const shares = (p: PostSummary) => p.tags.some((tag) => tags.includes(tag));
  return [...others.filter(shares), ...others.filter((p) => !shares(p))].slice(
    0,
    3,
  );
}

export { POSTS };

export function formatDate(locale: Locale, iso: string) {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(iso));
}
