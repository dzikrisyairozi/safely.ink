import { ArrowRight } from 'lucide-react';
import { Logo } from '@repo/ui/components/brand/logo';
import { Button } from '@repo/ui/components/ui/button';
import { getT } from '@/i18n/translate';
import { APP_URL, localePath, type Locale } from '@/lib/site';
import { LanguageLinks } from './language-links';
import { ThemeToggle } from './theme-toggle';

export function Header({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2"
      >
        {t('nav.skip')}
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
        <a
          href={localePath(locale)}
          aria-label={t('nav.home')}
          className="mr-auto text-xl"
        >
          <Logo />
        </a>
        <a
          href={localePath(locale, '/blog')}
          className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
        >
          {t('nav.blog')}
        </a>
        <LanguageLinks locale={locale} label={t('nav.language')} />
        <ThemeToggle label={t('nav.theme')} />
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <a href={APP_URL}>
            {t('cta.check')} <ArrowRight />
          </a>
        </Button>
      </div>
    </header>
  );
}
