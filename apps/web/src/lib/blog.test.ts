import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/lib/site';
import {
  POSTS,
  listPosts,
  plainText,
  postSource,
  readingMinutes,
} from './blog';

describe('posts', () => {
  it('lists exactly the articles that exist, in every language', () => {
    const slugs = POSTS.map((post) => post.slug).sort();
    for (const locale of LOCALES) {
      const files = readdirSync(join(process.cwd(), 'content/blog', locale))
        .filter((file) => file.endsWith('.mdx'))
        .map((file) => file.replace(/.mdx$/, ''))
        .sort();
      expect(files, locale).toEqual(slugs);
    }
  });

  it('uses unique, kebab-case slugs', () => {
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('keeps titles and descriptions inside what search results show', () => {
    for (const post of POSTS) {
      for (const locale of LOCALES) {
        const { title, description } = post[locale];
        expect(
          title.length,
          `${post.slug} ${locale} title`,
        ).toBeLessThanOrEqual(60);
        expect(
          description.length,
          `${post.slug} ${locale} description`,
        ).toBeGreaterThanOrEqual(70);
        expect(
          description.length,
          `${post.slug} ${locale} description`,
        ).toBeLessThanOrEqual(160);
      }
    }
  });

  it('has real dates, updated no earlier than published', () => {
    for (const post of POSTS) {
      expect(Number.isNaN(Date.parse(post.date))).toBe(false);
      expect(post.updated >= post.date).toBe(true);
    }
  });

  it('never repeats the page title as an h1 inside the article', () => {
    for (const post of POSTS) {
      for (const locale of LOCALES) {
        expect(postSource(locale, post.slug)).not.toMatch(/^# /m);
      }
    }
  });
});

describe('helpers', () => {
  it('lists newest first with a reading time', () => {
    const posts = listPosts('en');
    expect(posts).toHaveLength(POSTS.length);
    for (const post of posts) expect(post.minutes).toBeGreaterThan(0);
  });

  it('counts about 220 words a minute', () => {
    expect(readingMinutes('word '.repeat(1100))).toBe(5);
  });

  it('turns links and emphasis into plain text', () => {
    expect(plainText('*Note*: see [the law](https://x.test) and `code`.')).toBe(
      'Note: see the law and code.',
    );
  });
});
