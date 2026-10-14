'use client';

import type { RefObject } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useTranslation } from '@repo/i18n';
import { Pangolin } from '@repo/ui/components/brand/pangolin';
import { CAPTIONS, Footnote, PEN } from './descent';

const CLAUSES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const;
// Where each caption is on screen, as fractions of the section's scroll.
const CAPTION_AT = [
  [0, 0.04, 0.2, 0.26],
  [0.24, 0.3, 0.46, 0.52],
  [0.5, 0.56, 0.68, 0.74],
  [0.74, 0.8, 1, 1],
] as const;

/** The sticky stage of the descent, driven by the scroll through `target`. */
export default function DescentStage({
  target,
}: {
  target: RefObject<HTMLDivElement>;
}) {
  const { t } = useTranslation('web');
  const { scrollYProgress: p } = useScroll({
    target,
    offset: ['start start', 'end end'],
  });

  // Nearer layers move faster, so the eye reads depth.
  const numbersY = useTransform(p, [0, 1], ['0%', '-25%']);
  const titleY = useTransform(p, [0, 0.3], ['0vh', '-70vh']);
  const titleOpacity = useTransform(p, [0.12, 0.3], [1, 0]);
  const clausesY = useTransform(p, [0, 0.75], ['55vh', '-150vh']);
  const smallY = useTransform(p, [0.35, 0.95], ['90vh', '-55vh']);
  const smallScale = useTransform(p, [0.35, 0.95], [0.7, 0.9]);
  const footnoteOpacity = useTransform(p, [0.66, 0.76], [0, 1]);
  const footnoteScale = useTransform(p, [0.66, 0.9], [0.85, 1.05]);
  const circle = useTransform(p, [0.78, 0.92], [0, 1]);
  const ballY = useTransform(p, [0, 1], ['-20vh', '75vh']);
  const ballRotate = useTransform(p, [0, 1], [0, 900]);

  return (
    <div aria-hidden className="sticky top-0 h-svh overflow-hidden">
      <motion.div
        style={{ y: numbersY }}
        className="absolute inset-0 grid grid-cols-4 content-start gap-y-24 px-6 pt-40 font-mono text-[12vw] leading-none opacity-[0.04] md:grid-cols-6 md:text-[7vw]"
      >
        {Array.from({ length: 36 }, (_, i) => (
          // Drawn by CSS, so these decorative numbers are not page text.
          <span
            key={i}
            data-n={`§${i + 1}`}
            className="before:content-[attr(data-n)]"
          />
        ))}
      </motion.div>

      <motion.div
        style={{ y: titleY, opacity: titleOpacity }}
        className="absolute inset-x-0 top-[38%] text-center"
      >
        <p className="font-serif text-[11vw] leading-none tracking-tight md:text-[8vw]">
          {t('descent.title')}
        </p>
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.3em] opacity-60">
          {t('descent.subtitle')}
        </p>
      </motion.div>

      <motion.ol
        style={{ y: clausesY }}
        className="absolute inset-x-0 top-0 mx-auto max-w-2xl space-y-14 px-6 font-serif text-xl leading-relaxed opacity-80 md:text-2xl"
      >
        {CLAUSES.map((c) => (
          <li key={c}>{t(`descent.clauses.${c}`)}</li>
        ))}
      </motion.ol>

      <motion.div
        style={{ y: smallY, scale: smallScale }}
        className="absolute inset-x-0 top-0 mx-auto max-w-xl columns-2 gap-6 px-6 text-xs leading-snug opacity-50"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <p key={i} className="mb-3">
            {t('descent.smallPrint')}
          </p>
        ))}
      </motion.div>

      <motion.div
        style={{ opacity: footnoteOpacity, scale: footnoteScale }}
        className="absolute inset-x-0 top-[55%] mx-auto max-w-2xl px-6"
      >
        <Footnote
          pen={<motion.path {...PEN} style={{ pathLength: circle }} />}
        />
      </motion.div>

      <motion.div
        style={{ y: ballY, rotate: ballRotate }}
        className="absolute right-[6vw] top-0 w-[18vw] max-w-40 min-w-20"
      >
        <Pangolin variant="ball" className="w-full" />
      </motion.div>

      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-12 md:px-6 md:pb-16">
        {CAPTIONS.map((c, i) => (
          <Caption key={c} progress={p} at={CAPTION_AT[i]!}>
            {t(`descent.captions.${c}`)}
          </Caption>
        ))}
      </div>
    </div>
  );
}

function Caption({
  progress,
  at,
  children,
}: {
  progress: MotionValue<number>;
  at: readonly [number, number, number, number];
  children: string;
}) {
  const opacity = useTransform(progress, [...at], [0, 1, 1, 0]);
  const y = useTransform(progress, [at[0], at[1]], [24, 0]);

  return (
    <motion.p
      style={{ opacity, y }}
      className="absolute bottom-12 max-w-2xl text-balance font-serif text-3xl leading-tight md:bottom-16 md:text-5xl"
    >
      {children}
    </motion.p>
  );
}
