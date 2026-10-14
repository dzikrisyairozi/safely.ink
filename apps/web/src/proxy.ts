import { NextResponse, type NextRequest } from 'next/server';
import {
  DEFAULT_LOCALE,
  LOCALE_HEADER,
  isLocale,
  type Locale,
} from '@/lib/site';

// English lives at unprefixed URLs and every other language under /<locale>.
// Pages are built under app/[locale], so unprefixed paths are rewritten to the
// English tree, and /en/... is sent back to the one public URL. There is no
// Accept-Language guess and no language cookie: every visitor, crawler and
// CDN cache gets the URL it asked for.

function withLocale(request: NextRequest, locale: Locale) {
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  return { request: { headers } };
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split('/')[1];

  if (first === DEFAULT_LOCALE) {
    // Generated metadata images are linked under /en, so they stay reachable there.
    if (/\/(opengraph|twitter)-image[^/]*$/.test(pathname)) return;
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || '/';
    return NextResponse.redirect(url, 308);
  }

  if (isLocale(first)) return NextResponse.next(withLocale(request, first));

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url, withLocale(request, DEFAULT_LOCALE));
}

export const config = {
  // Everything except Next internals and files (any path with a dot:
  // sitemap.xml, robots.txt, llms.txt, icons, fonts, the reel).
  matcher: ['/((?!_next/|.*\\.).*)'],
};
