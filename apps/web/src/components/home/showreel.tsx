'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Maximize, Pause, Play } from 'lucide-react';
import { useTheme } from 'next-themes';
import { usePrefersReducedMotion } from '@repo/ui/hooks/use-prefers-reduced-motion';
import type { PlayerRef } from '@remotion/player';
import { useTranslation } from '@repo/i18n';
import type { Locale } from '@/lib/site';

const ReelPlayer = dynamic(() => import('./reel-player'), { ssr: false });

/**
 * The showreel, played live: text in the page's language, colours in its
 * theme. A poster holds the space until the player is close to the viewport;
 * it plays while on screen and pauses when scrolled away.
 */
export function Showreel({ locale }: { locale: Locale }) {
  const { t } = useTranslation('web');
  const { resolvedTheme } = useTheme();
  const reduce = usePrefersReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerRef>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tall, setTall] = useState(false);

  const format = tall ? 'tall' : 'wide';
  const theme = resolvedTheme === 'light' ? 'light' : 'dark';

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setTall(media.matches);
    update();
    media.addEventListener('change', update);
    const el = box.current!;
    const nearby = new IntersectionObserver(
      ([e]) => e?.isIntersecting && setNear(true),
      { rootMargin: '100% 0px' },
    );
    const visible = new IntersectionObserver(
      ([e]) => setOnScreen(!!e?.isIntersecting),
      { threshold: 0.4 },
    );
    nearby.observe(el);
    visible.observe(el);
    return () => {
      media.removeEventListener('change', update);
      nearby.disconnect();
      visible.disconnect();
    };
  }, []);

  // Listen before the autoplay effect below fires the first `play`.
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    p.addEventListener('play', on);
    p.addEventListener('pause', off);
    return () => {
      p.removeEventListener('play', on);
      p.removeEventListener('pause', off);
    };
  }, [ready, format]);

  // Autoplay only while visible, and never for reduced motion.
  useEffect(() => {
    if (!player.current) return;
    if (onScreen && !reduce) player.current.play();
    else player.current.pause();
  }, [onScreen, reduce, ready]);

  return (
    <section
      aria-label={t('reel.label')}
      className="px-4 pb-20 md:px-6 md:pb-28"
    >
      <div
        ref={box}
        className="relative mx-auto aspect-[4/5] max-w-6xl overflow-hidden rounded-xl border border-border bg-muted md:aspect-video"
      >
        {/* The poster is the reel's own frame, in the dark cut. */}
        <picture>
          <source
            media="(max-width: 767px)"
            srcSet={`/reel/poster-${locale}-tall.jpg`}
          />
          <img
            src={`/reel/poster-${locale}-wide.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
        {near && (
          <div className="absolute inset-0">
            <ReelPlayer
              playerRef={player}
              onReady={() => setReady(true)}
              format={format}
              locale={locale}
              theme={theme}
            />
          </div>
        )}
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button
            type="button"
            onClick={() => player.current?.toggle()}
            aria-label={playing ? t('reel.pause') : t('reel.play')}
            className="inline-flex size-10 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
          >
            {playing ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => player.current?.requestFullscreen()}
            aria-label={t('reel.fullscreen')}
            className="inline-flex size-10 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
          >
            <Maximize className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
