import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import robots, { AI_CRAWLERS } from '@/app/robots';
import sitemap from '@/app/sitemap';
import {
  JsonLd,
  breadcrumbsLd,
  faqPageLd,
  pageMetadata,
  softwareApplicationLd,
} from './seo';

const site = 'https://safely.test';

describe('pageMetadata', () => {
  it('points canonical, alternates and Open Graph at the right language', () => {
    const meta = pageMetadata({
      locale: 'id',
      path: '/blog/x',
      title: 'Judul',
      description: 'Deskripsi',
    });

    expect(meta.alternates?.canonical).toBe('/id/blog/x');
    expect(meta.alternates?.languages).toEqual({
      en: '/blog/x',
      id: '/id/blog/x',
      'x-default': '/blog/x',
    });
    expect(meta.openGraph).toMatchObject({
      url: '/id/blog/x',
      locale: 'id_ID',
      alternateLocale: ['en_US'],
      type: 'website',
    });
  });

  it('gives the English home page the bare root URL', () => {
    const meta = pageMetadata({
      locale: 'en',
      path: '/',
      title: 't',
      description: 'd',
      absoluteTitle: true,
    });

    expect(meta.alternates?.canonical).toBe('/');
    expect(meta.title).toEqual({ absolute: 't' });
  });

  it('carries article dates and tags', () => {
    const meta = pageMetadata({
      locale: 'en',
      path: '/blog/x',
      title: 't',
      description: 'd',
      type: 'article',
      publishedTime: '2026-10-15',
      modifiedTime: '2026-10-16',
      tags: ['insurance'],
    });

    expect(meta.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-10-15',
      modifiedTime: '2026-10-16',
      tags: ['insurance'],
    });
  });
});

describe('sitemap', () => {
  it('lists every page in every language with absolute alternates', () => {
    const entries = sitemap();
    const home = entries.find((e) => e.url === `${site}/id`);

    expect(entries.map((e) => e.url)).toEqual(
      expect.arrayContaining([`${site}/`, `${site}/id`]),
    );
    expect(home?.alternates?.languages).toEqual({
      en: `${site}/`,
      id: `${site}/id`,
      'x-default': `${site}/`,
    });
  });
});

describe('robots', () => {
  it('welcomes answer engines and points at the sitemap', () => {
    const result = robots();
    const agents = [result.rules]
      .flat()
      .flatMap((rule) => [rule.userAgent ?? []].flat());

    for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', '*']) {
      expect(agents).toContain(bot);
    }
    expect(AI_CRAWLERS.length).toBeGreaterThan(5);
    expect(result.sitemap).toBe(`${site}/sitemap.xml`);
  });
});

describe('JsonLd', () => {
  it('cannot be closed early by text inside the data', () => {
    const html = renderToStaticMarkup(
      createElement(JsonLd, {
        data: breadcrumbsLd([{ name: '</script><b>x', path: '/' }]),
      }),
    );

    expect(html).not.toContain('</script><b>');
    expect(html).toContain('\\u003c/script>');
    expect(html).toContain(`"item":"${site}/"`);
  });
});

describe('home structured data', () => {
  it('turns every FAQ entry into a question with its answer', async () => {
    const { faqItems, FAQ_KEYS } = await import('@/components/home/faq');
    const ld = faqPageLd(faqItems('id'));

    expect(ld.mainEntity).toHaveLength(FAQ_KEYS.length);
    for (const entry of ld.mainEntity) {
      expect(entry.name).not.toMatch(/^faq\./);
      expect(entry.acceptedAnswer.text.length).toBeGreaterThan(40);
    }
  });

  it('describes the app in the page language', () => {
    expect(softwareApplicationLd('id', 'd')).toMatchObject({
      url: `${site}/id`,
      inLanguage: 'id',
      offers: { price: '0' },
    });
  });
});
