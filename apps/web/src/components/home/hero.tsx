import { ArrowRight } from 'lucide-react';
import { Button } from '@repo/ui/components/ui/button';
import { getT } from '@/i18n/translate';
import { APP_URL, type Locale } from '@/lib/site';
import { HeroCanvas } from './hero-canvas';
import { HeroVisual } from './hero-visual';

export function Hero({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <section className="group/hero relative overflow-hidden">
      {/* Ruled paper, fading out towards the bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,var(--border)_31px,var(--border)_32px)] opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />
      <HeroCanvas />
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 md:grid-cols-[1.2fr_0.8fr] md:px-6 md:pb-28 md:pt-20">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            § 1 · {t('hero.kicker')}
          </p>
          <h1 className="mt-5 text-balance font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            {t('hero.title')}
          </h1>
          <p className="mt-8 max-w-xl text-pretty text-lg text-muted-foreground">
            {t('hero.problem')}
          </p>
          <p className="mt-4 max-w-xl text-pretty text-lg">
            {t('hero.answer')}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <a href={APP_URL}>
                {t('cta.check')} <ArrowRight />
              </a>
            </Button>
            <a
              href="#how"
              className="text-sm underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              {t('cta.how')}
            </a>
          </div>
          <p className="mt-8 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {t('notice')}
          </p>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
