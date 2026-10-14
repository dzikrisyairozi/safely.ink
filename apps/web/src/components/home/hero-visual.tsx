'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePrefersReducedMotion } from '@repo/ui/hooks/use-prefers-reduced-motion';
import { Pangolin } from '@repo/ui/components/brand/pangolin';
import { cn } from '@repo/ui/lib/utils';

const HeroScene = dynamic(() => import('./hero-scene'), { ssr: false });

function hasWebGL() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** The SVG ball first; the 3D ball replaces it when the browser can afford it. */
export function HeroVisual() {
  const reduce = usePrefersReducedMotion();
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);

  // three.js is large: it waits for the first sign of a person (pointer,
  // scroll, key) or a few quiet seconds, so it never competes with first paint.
  useEffect(() => {
    if (reduce || !hasWebGL()) return;
    const events = ['pointermove', 'pointerdown', 'scroll', 'keydown'];
    const start = () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, start));
      setLoad(true);
    };
    const timer = setTimeout(start, 6000);
    events.forEach((e) =>
      window.addEventListener(e, start, { once: true, passive: true }),
    );
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, start));
    };
  }, [reduce]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm md:max-w-none">
      <Pangolin
        variant="ball"
        className={cn(
          'absolute inset-[12%] text-foreground transition-opacity duration-700',
          ready && 'opacity-0',
        )}
      />
      {load && (
        <div
          className={cn(
            'absolute -inset-[10%] transition-opacity duration-700',
            ready ? 'opacity-100' : 'opacity-0',
          )}
        >
          <HeroScene onReady={() => setReady(true)} />
        </div>
      )}
    </div>
  );
}
