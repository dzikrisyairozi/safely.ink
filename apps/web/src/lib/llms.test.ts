import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { POSTS } from './blog';
import { llmsFullTxt, llmsTxt } from './llms';

describe('llms.txt', () => {
  it('links every article and the full text', () => {
    const text = llmsTxt();
    for (const post of POSTS) {
      expect(text).toContain(`/blog/${post.slug})`);
      expect(text).toContain(post.en.title);
    }
    expect(text).toContain('/llms-full.txt');
  });

  it('carries the FAQ and every article in full', () => {
    const text = llmsFullTxt();
    expect(text).toContain('Is safely.ink legal advice?');
    for (const post of POSTS) expect(text).toContain(`# ${post.en.title}`);
  });
});

describe('sitemap', () => {
  it('lists every article in both languages with its last change', () => {
    const entries = sitemap();
    for (const post of POSTS) {
      const urls = entries.filter((e) => e.url.endsWith(`/blog/${post.slug}`));
      expect(urls).toHaveLength(2);
      expect(urls[0]?.lastModified).toBe(post.updated);
    }
  });
});
