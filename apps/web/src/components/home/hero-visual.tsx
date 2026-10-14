'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import { Pangolin } from '@repo/ui/components/brand/pangolin';
import { cn } from '@repo/ui/lib/utils';

// three.js stays out of the first load: it arrives once the page is idle.
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
  const reduce = useReducedMotion();
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduce || !hasWebGL()) return;
    const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1200));
    const id = idle(() => setLoad(true));
    return () => (window.cancelIdleCallback ?? clearTimeout)(id);
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
