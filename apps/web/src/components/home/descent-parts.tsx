'use client';

import type { ReactNode } from 'react';
import { useTranslation } from '@repo/i18n';

// Shared by the still descent (descent.tsx) and the moving stage
// (descent-stage.tsx), which loads on its own.

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
      <p className="mt-2 px-6 font-mono text-[10px] uppercase tracking-widest opacity-75">
        {t('descent.note')}
      </p>
    </div>
  );
}
