'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@repo/i18n';
import { usePrefersReducedMotion } from '@repo/ui/hooks/use-prefers-reduced-motion';

// The moving stage (and framer-motion with it) loads only when the section is
// about a screen away, so it costs nothing on first load.
const DescentStage = dynamic(() => import('./descent-stage'), { ssr: false });

export const CAPTIONS = ['a', 'b', 'c', 'd'] as const;

/** The red pen's loop around the footnote: this line is the trap. */
export const PEN = {
  d: 'M40 88 C -4 76, -2 22, 60 10 C 160 -8, 340 -4, 392 30 C 418 52, 380 92, 250 96 C 170 99, 90 98, 52 80',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const;

/**
 * Full-width parallax: scrolling sinks through the layers of one contract,
 * headline to body to small print, down to the footnote that holds the trap,
 * which the red pen circles. With reduced motion it is a still page.
 */
export function Descent() {
  const { t } = useTranslation('web');
  const reduce = usePrefersReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (reduce || !track.current) return;
    const io = new IntersectionObserver(
      ([e]) => e?.isIntersecting && setNear(true),
      { rootMargin: '100% 0px' },
    );
    io.observe(track.current);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <section
      aria-labelledby="descent"
      className="relative bg-foreground text-background"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto max-w-6xl px-4 pt-20 md:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">
          § 4 · {t('descent.kicker')}
        </p>
        <h2
          id="descent"
          className="mt-3 max-w-xl font-serif text-3xl md:text-4xl"
        >
          {t('descent.heading')}
        </h2>
      </div>
      {reduce ? (
        <div className="mx-auto max-w-3xl space-y-8 px-4 pb-24 pt-56 md:px-6">
          {CAPTIONS.map((c) => (
            <p key={c} className="font-serif text-3xl md:text-4xl">
              {t(`descent.captions.${c}`)}
            </p>
          ))}
          <Footnote pen={<path {...PEN} />} />
        </div>
      ) : (
        <div ref={track} className="relative h-[420vh]">
          {/* The same words for crawlers and screen readers; the stage is decoration. */}
          <div className="sr-only">
            {CAPTIONS.map((c) => (
              <p key={c}>{t(`descent.captions.${c}`)}</p>
            ))}
            <p>{t('descent.footnote')}</p>
          </div>
          {near && <DescentStage target={track} />}
        </div>
      )}
    </section>
  );
}

export function Footnote({ pen }: { pen: ReactNode }) {
  const { t } = useTranslation('web');

  return (
    <div className="relative">
      <p className="relative z-10 text-pretty px-6 py-6 font-serif text-xl italic md:text-2xl">
        {t('descent.footnote')}
      </p>
      <svg
        aria-hidden
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible text-destructive"
      >
        {pen}
      </svg>
      <p className="mt-2 px-6 font-mono text-[10px] uppercase tracking-widest opacity-50">
        {t('descent.note')}
      </p>
    </div>
  );
}
