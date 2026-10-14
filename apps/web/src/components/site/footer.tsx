import { Pangolin } from '@repo/ui/components/brand/pangolin';
import { getT } from '@/i18n/translate';
import { CONTACT_EMAIL, SITE_NAME, type Locale } from '@/lib/site';

export function Footer({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1fr_auto] md:px-6">
        <div className="space-y-3">
          <Pangolin variant="ball" className="size-8" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {t('footer.tagline')}
          </p>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {t('notice')}
          </p>
        </div>
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
