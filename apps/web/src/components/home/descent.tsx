'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@repo/i18n';
import { usePrefersReducedMotion } from '@repo/ui/hooks/use-prefers-reduced-motion';
import { cn } from '@repo/ui/lib/utils';
import { CAPTIONS, Footnote, PEN } from './descent-parts';
import { Island } from './island';

// The moving stage (and framer-motion with it) loads only when the section is
// about a screen away, so it costs nothing on first load.
const DescentStage = dynamic(() => import('./descent-stage'), { ssr: false });

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
  // If the stage fails to load, show the words as reduced motion does.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (reduce || !track.current) return;
    const io = new IntersectionObserver(
      ([e]) => e?.isIntersecting && setNear(true),
      { rootMargin: '100% 0px' },
    );
    io.observe(track.current);
    return () => io.disconnect();
  }, [reduce]);

  // Both versions are in the HTML and CSS picks one, so reduced motion gets
  // the still page from the first paint, not after hydration.
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
      <div
        className={cn(
          'mx-auto max-w-3xl space-y-8 px-4 pb-24 pt-56 md:px-6',
          !failed && 'hidden motion-reduce:block',
        )}
      >
        {CAPTIONS.map((c) => (
          <p key={c} className="font-serif text-3xl md:text-4xl">
            {t(`descent.captions.${c}`)}
          </p>
        ))}
        <Footnote pen={<path {...PEN} />} />
      </div>
      <div
        ref={track}
        className={cn(
          'relative h-[420vh] motion-reduce:hidden',
          failed && 'hidden',
        )}
      >
        {/* The same words for crawlers and screen readers; the stage is decoration. */}
        <div className="sr-only">
          {CAPTIONS.map((c) => (
            <p key={c}>{t(`descent.captions.${c}`)}</p>
          ))}
          <p>{t('descent.footnote')}</p>
        </div>
        {near && (
          <Island onError={() => setFailed(true)}>
            <DescentStage target={track} />
          </Island>
        )}
      </div>
    </section>
  );
}
