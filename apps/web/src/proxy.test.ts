import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { LOCALE_HEADER } from '@/lib/site';
import { config, proxy } from './proxy';

const origin = 'https://safely.test';

function run(path: string, cookie?: string) {
  const request = new NextRequest(`${origin}${path}`, {
    headers: cookie ? { cookie } : {},
  });
  return proxy(request);
}

const rewrittenTo = (path: string, cookie?: string) =>
  run(path, cookie)?.headers.get('x-middleware-rewrite');

describe('proxy', () => {
  it('serves unprefixed paths from the English tree', () => {
    expect(rewrittenTo('/')).toBe(`${origin}/en`);
    expect(rewrittenTo('/blog/what-is-a-policy-fuzzer')).toBe(
      `${origin}/en/blog/what-is-a-policy-fuzzer`,
    );
  });

  it('sends /en back to the unprefixed URL', () => {
    for (const [from, to] of [
      ['/en', '/'],
      ['/en/blog/x', '/blog/x'],
    ]) {
      const response = run(from);
      expect(response?.status).toBe(308);
      expect(response?.headers.get('location')).toBe(`${origin}${to}`);
    }
  });

  it('keeps English metadata images where Next links them', () => {
    expect(run('/en/opengraph-image')).toBeUndefined();
    expect(run('/en/blog/x/opengraph-image-1a2b')).toBeUndefined();
  });

  it('leaves other languages where they are', () => {
    for (const path of ['/id', '/id/blog/x']) {
      const response = run(path);
      expect(response?.status).toBe(200);
      expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
      expect(response?.headers.get('location')).toBeNull();
    }
  });

  it('serves the URL it was asked for, whatever cookie is set', () => {
    // A redirect that depends on a cookie would be cached by the CDN for everyone.
    expect(rewrittenTo('/', 'NEXT_LOCALE=id')).toBe(`${origin}/en`);
  });

  it('tells the page which language the URL is in, for the 404 page', () => {
    const locale = (path: string) =>
      run(path)?.headers.get(`x-middleware-request-${LOCALE_HEADER}`);

    expect(locale('/no-such-page')).toBe('en');
    expect(locale('/id/no-such-page')).toBe('id');
    expect(locale('/id')).toBe('id');
  });

  it('does not run for files or Next internals', () => {
    const matches = (url: string) =>
      unstable_doesMiddlewareMatch({ config, url });

    for (const file of [
      '/sitemap.xml',
      '/robots.txt',
      '/llms.txt',
      '/favicon.ico',
      '/icon.svg',
      '/reel/showreel-en.mp4',
      '/_next/static/chunk.js',
    ]) {
      expect(matches(file), file).toBe(false);
    }
    for (const page of ['/', '/id', '/blog/x', '/feed', '/opengraph-image']) {
      expect(matches(page), page).toBe(true);
    }
  });
});
