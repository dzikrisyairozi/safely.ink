'use client';

import { useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useTranslation } from '@repo/i18n';
import { Pangolin } from '@repo/ui/components/brand/pangolin';

const CLAUSES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const;
const CAPTIONS = ['a', 'b', 'c', 'd'] as const;
// Where each caption is on screen, as fractions of the section's scroll.
const CAPTION_AT = [
  [0, 0.04, 0.2, 0.26],
  [0.24, 0.3, 0.46, 0.52],
  [0.5, 0.56, 0.68, 0.74],
  [0.74, 0.8, 1, 1],
] as const;

/**
 * Full-width parallax: scrolling sinks through the layers of one contract,
 * headline to body to small print, down to the footnote that holds the trap,
 * which the red pen circles. Transforms and opacity only.
 */
export function Descent() {
  return useReducedMotion() ? <StillDescent /> : <MovingDescent />;
}

function StillDescent() {
  const { t } = useTranslation('web');

  return (
    <Frame>
      <div className="mx-auto max-w-3xl space-y-8 px-4 pb-24 pt-56 md:px-6">
        {CAPTIONS.map((c) => (
          <p key={c} className="font-serif text-3xl md:text-4xl">
            {t(`descent.captions.${c}`)}
          </p>
        ))}
        <Footnote circle={1} />
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('web');
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
      {children}
    </section>
  );
}

function MovingDescent() {
  const { t } = useTranslation('web');
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  // Nearer layers move faster, so the eye reads depth.
  const numbersY = useTransform(p, [0, 1], ['0%', '-25%']);
  const titleY = useTransform(p, [0, 0.3], ['0vh', '-70vh']);
  const titleOpacity = useTransform(p, [0.12, 0.3], [1, 0]);
  const clausesY = useTransform(p, [0, 0.75], ['55vh', '-150vh']);
  const smallY = useTransform(p, [0.35, 0.95], ['90vh', '-55vh']);
  const smallScale = useTransform(p, [0.35, 0.95], [0.9, 1.15]);
  const footnoteOpacity = useTransform(p, [0.66, 0.76], [0, 1]);
  const footnoteScale = useTransform(p, [0.66, 0.9], [0.85, 1.05]);
  const circle = useTransform(p, [0.78, 0.92], [0, 1]);
  const ballY = useTransform(p, [0, 1], ['-20vh', '75vh']);
  const ballRotate = useTransform(p, [0, 1], [0, 900]);

  return (
    <Frame>
      <div ref={ref} className="relative h-[420vh]">
        <div className="sticky top-0 h-svh overflow-hidden">
          <motion.div
            aria-hidden
            style={{ y: numbersY }}
            className="absolute inset-0 grid grid-cols-4 content-start gap-y-24 px-6 pt-40 font-mono text-[12vw] leading-none opacity-[0.04] md:grid-cols-6 md:text-[7vw]"
          >
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i}>§{i + 1}</span>
            ))}
          </motion.div>

          <motion.div
            aria-hidden
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
            aria-hidden
            style={{ y: clausesY }}
            className="absolute inset-x-0 top-0 mx-auto max-w-2xl space-y-14 px-6 font-serif text-xl leading-relaxed opacity-80 md:text-2xl"
          >
            {CLAUSES.map((c) => (
              <li key={c}>{t(`descent.clauses.${c}`)}</li>
            ))}
          </motion.ol>

          <motion.div
            aria-hidden
            style={{ y: smallY, scale: smallScale }}
            className="absolute inset-x-0 top-0 mx-auto max-w-xl columns-2 gap-6 px-6 text-[9px] leading-snug opacity-50 md:text-[10px]"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <p key={i} className="mb-3">
                {t('descent.smallPrint')}
              </p>
            ))}
          </motion.div>

          <motion.div
            style={{ opacity: footnoteOpacity, scale: footnoteScale }}
            className="absolute inset-x-0 top-[55%] mx-auto max-w-2xl px-6"
          >
            <Footnote circle={circle} />
          </motion.div>

          <motion.div
            aria-hidden
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
      </div>
    </Frame>
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

function Footnote({ circle }: { circle: MotionValue<number> | number }) {
  const { t } = useTranslation('web');

  return (
    <div className="relative">
      <p className="relative z-10 text-pretty px-6 py-6 font-serif text-xl italic md:text-2xl">
        {t('descent.footnote')}
      </p>
      {/* The reviewer's red pen: this line is the trap. */}
      <svg
        aria-hidden
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible text-destructive"
      >
        <motion.path
          d="M40 88 C -4 76, -2 22, 60 10 C 160 -8, 340 -4, 392 30 C 418 52, 380 92, 250 96 C 170 99, 90 98, 52 80"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ pathLength: circle }}
        />
      </svg>
      <p className="mt-2 px-6 font-mono text-[10px] uppercase tracking-widest opacity-50">
        {t('descent.note')}
      </p>
    </div>
  );
}
