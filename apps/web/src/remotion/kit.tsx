import type { ReactNode } from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import en from '../i18n/locales/en.json';
import id from '../i18n/locales/id.json';
import type { Locale } from '../lib/site';

export type ReelCopy = typeof en.reel & { cta: string };
export type ReelProps = { locale: Locale; theme: 'light' | 'dark' };
export type SceneProps = { copy: ReelCopy };

export function reelCopy(locale: Locale): ReelCopy {
  const strings = locale === 'id' ? id : en;
  return { ...strings.reel, cta: strings.cta.check };
}

// Colours come from the theme tokens, so the reel follows light and dark.
// Red is the reviewer's pen: only for traps.
export const C = {
  bg: 'var(--background)',
  fg: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  card: 'var(--card)',
  soft: 'var(--muted)',
  border: 'var(--border)',
  red: 'var(--destructive)',
};

export const FONTS = {
  serif: "var(--font-newsreader, 'Newsreader'), Georgia, serif",
  sans: "var(--font-geist, 'Geist'), system-ui, sans-serif",
  mono: "var(--font-geist-mono, 'Geist Mono'), ui-monospace, monospace",
};

/** 1% of the shorter side, so layouts scale between the wide and tall cuts. */
export function useUnit() {
  const { width, height } = useVideoConfig();
  return { u: Math.min(width, height) / 100, tall: height > width };
}

export function useSpring(delay = 0, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
}

/** 0 → 1 → 0 across a scene, for a soft cut in and out. */
export function useSceneFade(fadeIn = 10, fadeOut = 10) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}

/** Step number and title top left, caption along the bottom. */
export function Chapter({
  step,
  title,
  caption,
  children,
}: {
  step: number;
  title: string;
  caption: string;
  children: ReactNode;
}) {
  const { u } = useUnit();
  const opacity = useSceneFade();
  const enter = useSpring(4);
  const captionIn = useSpring(18);

  return (
    <AbsoluteFill style={{ opacity }}>
      {children}
      <div
        style={{
          position: 'absolute',
          left: 6 * u,
          top: 6 * u,
          display: 'flex',
          alignItems: 'baseline',
          gap: 2 * u,
          transform: `translateY(${(1 - enter) * 3 * u}px)`,
          opacity: enter,
        }}
      >
        <span
          style={{ fontFamily: FONTS.mono, fontSize: 2.4 * u, color: C.muted }}
        >
          {String(step).padStart(2, '0')}
        </span>
        <span
          style={{ fontFamily: FONTS.serif, fontSize: 6 * u, lineHeight: 1 }}
        >
          {title}
        </span>
      </div>
      <p
        style={{
          position: 'absolute',
          left: 6 * u,
          right: 6 * u,
          bottom: 6 * u,
          margin: 0,
          fontSize: 3.2 * u,
          lineHeight: 1.3,
          color: C.muted,
          opacity: captionIn,
          transform: `translateY(${(1 - captionIn) * 2 * u}px)`,
        }}
      >
        {caption}
      </p>
    </AbsoluteFill>
  );
}

/** A text line drawn as a bar, the way pages look from far away. */
export function Bar({
  width,
  u,
  color = C.border,
}: {
  width: string | number;
  u: number;
  color?: string;
}) {
  return (
    <div
      style={{
        height: 1.1 * u,
        width,
        borderRadius: u,
        background: color,
      }}
    />
  );
}
