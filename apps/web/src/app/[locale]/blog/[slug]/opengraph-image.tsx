import { getT } from '@/i18n/translate';
import { POSTS, getPost } from '@/lib/blog';
import { OG_SIZE, ogImage } from '@/lib/og';
import { DEFAULT_LOCALE, LOCALES, isLocale } from '@/lib/site';

export const alt = 'safely.ink';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    POSTS.map((post) => ({ locale, slug: post.slug })),
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: value, slug } = await params;
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  const t = getT(locale);
  const post = getPost(locale, slug);
  return ogImage({
    kicker: `${t('blog.kicker')} · ${post?.tags.map((tag) => t(`blog.tags.${tag}`)).join(' · ')}`,
    title: post?.title ?? t('blog.title'),
  });
}
