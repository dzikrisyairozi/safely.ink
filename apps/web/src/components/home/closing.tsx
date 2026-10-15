import { ArrowRight } from 'lucide-react';
import { Button } from '@repo/ui/components/ui/button';
import { getT } from '@/i18n/translate';
import { APP_URL, type Locale } from '@/lib/site';

export function Closing({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <section
      aria-labelledby="closing"
      className="border-t border-border/60 bg-primary text-primary-foreground"
    >
      <div className="mx-auto max-w-4xl px-4 py-24 text-center md:px-6 md:py-32">
        <h2
          id="closing"
          className="text-balance font-serif text-4xl leading-[1.05] tracking-tight md:text-6xl"
        >
          {t('closing.heading')}
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-lg opacity-80">
          {t('closing.body')}
        </p>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="mt-10 h-12 px-6 text-base"
        >
          <a href={APP_URL}>
            {t('cta.check')} <ArrowRight />
          </a>
        </Button>
        <p className="mt-8 font-mono text-xs uppercase tracking-widest opacity-70">
          {t('notice')}
        </p>
      </div>
    </section>
  );
}
