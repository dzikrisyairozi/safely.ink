import { getT } from '@/i18n/translate';
import { listPosts } from '@/lib/blog';
import { absoluteUrl } from '@/lib/seo';
import {
  DEFAULT_LOCALE,
  LOCALES,
  SITE_NAME,
  isLocale,
  localePath,
} from '@/lib/site';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

const escape = (text: string) =>
  text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** RSS 2.0, one feed per language. */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: value } = await params;
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  const t = getT(locale);
  const blog = absoluteUrl(localePath(locale, '/blog'));
  const items = listPosts(locale)
    .map((post) => {
      const url = absoluteUrl(localePath(locale, `/blog/${post.slug}`));
      return [
        '<item>',
        `<title>${escape(post.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<description>${escape(post.description)}</description>`,
        `<pubDate>${new Date(post.date).toUTCString()}</pubDate>`,
        ...post.tags.map((tag) => `<category>${escape(tag)}</category>`),
        '</item>',
      ].join('');
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escape(`${SITE_NAME}: ${t('blog.title')}`)}</title><link>${blog}</link><atom:link href="${absoluteUrl(localePath(locale, '/blog/feed'))}" rel="self" type="application/rss+xml"/><description>${escape(t('blog.description'))}</description><language>${locale}</language>${items}</channel></rss>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
