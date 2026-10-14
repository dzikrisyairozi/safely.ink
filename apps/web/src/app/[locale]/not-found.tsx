import Link from 'next/link';
import { locale as rootLocale } from 'next/root-params';
import { getT } from '@/i18n/translate';
import { DEFAULT_LOCALE, isLocale, localePath } from '@/lib/site';

export default async function NotFound() {
  const value = await rootLocale();
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  const t = getT(locale);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="font-serif text-4xl">{t('notFound.title')}</h1>
      <p className="max-w-md text-muted-foreground">{t('notFound.body')}</p>
      <Link href={localePath(locale)} className="underline underline-offset-4">
        {t('notFound.home')}
      </Link>
    </main>
  );
}
