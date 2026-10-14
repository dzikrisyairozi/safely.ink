import { Pangolin } from '@repo/ui/components/brand/pangolin';
import { getT } from '@/i18n/translate';
import { CONTACT_EMAIL, SITE_NAME, localePath, type Locale } from '@/lib/site';

export function Footer({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const links = [
    {
      href: localePath(locale, '/how-it-works'),
      label: t('pages.howItWorks.title'),
    },
    { href: localePath(locale, '/blog'), label: t('nav.blog') },
    { href: localePath(locale, '/privacy'), label: t('pages.privacy.title') },
    { href: localePath(locale, '/terms'), label: t('pages.terms.title') },
    { href: localePath(locale, '/blog/feed'), label: t('blog.feed') },
  ];

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1fr_auto_auto] md:px-6">
        <div className="space-y-3">
          <Pangolin variant="ball" className="size-8" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {t('footer.tagline')}
          </p>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {t('notice')}
          </p>
        </div>
        <nav aria-label={t('footer.nav')}>
          <ul className="space-y-2 text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-2 text-sm md:text-right">
          <p className="text-muted-foreground">{t('footer.contact')}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline-offset-4 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="pt-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
