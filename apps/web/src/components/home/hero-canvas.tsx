'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePrefersReducedMotion } from '@repo/ui/hooks/use-prefers-reduced-motion';
import { cn } from '@repo/ui/lib/utils';
import { Island } from './island';

const HeroScene = dynamic(() => import('./hero-scene'), { ssr: false });

function hasWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    // Browsers cap live contexts; the scene opens its own right after.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * The 3D pangolin, behind the hero text and across the whole section, so pages
 * flying in or out are never cut off by a box around the ball.
 */
export function HeroCanvas() {
  const reduce = usePrefersReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);
  // Turning on reduced motion after load stops the scene and brings back
  // the flat mark.
  const shown = ready && !reduce;

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

  // Lets the flat mark in the section fade out (see HeroVisual).
  useEffect(() => {
    const section = box.current?.closest('section');
    if (shown) section?.setAttribute('data-hero-3d', 'ready');
    else section?.removeAttribute('data-hero-3d');
  }, [shown]);

  return (
    <div
      ref={box}
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 transition-opacity duration-700',
        shown ? 'opacity-100' : 'opacity-0',
      )}
    >
      {load && !reduce && (
        <Island>
          <HeroScene onReady={() => setReady(true)} />
        </Island>
      )}
    </div>
  );
}
