import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Pangolin } from '@repo/ui/components/brand/pangolin';
import { C, FONTS, useSpring, useUnit, type SceneProps } from '../kit';

/** Mark, name, one line and the call to action; fades so the loop can restart. */
export function EndCard({ copy }: SceneProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { u } = useUnit();
  const mark = useSpring(4, 14);
  const line = useSpring(22, 18);
  const button = useSpring(40, 16);
  const out = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3 * u,
        opacity: out,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 14 * u,
          height: 14 * u,
          color: C.fg,
          transform: `scale(${mark}) rotate(${(1 - mark) * 180}deg)`,
        }}
      >
        <Pangolin variant="ball" />
      </div>
      <div
        style={{
          fontFamily: FONTS.serif,
          fontSize: 9 * u,
          lineHeight: 1,
          opacity: mark,
        }}
      >
        safely.ink
      </div>
      <p
        style={{
          margin: 0,
          maxWidth: 80 * u,
          fontSize: 3.4 * u,
          color: C.muted,
          opacity: line,
        }}
      >
        {copy.end.line}
      </p>
      <div
        style={{
          marginTop: 2 * u,
          padding: `${1.8 * u}px ${3.6 * u}px`,
          borderRadius: 0.8 * u,
          background: C.fg,
          color: C.bg,
          fontSize: 3 * u,
          opacity: button,
          transform: `translateY(${(1 - button) * 3 * u}px)`,
        }}
      >
        {copy.cta} →
      </div>
    </AbsoluteFill>
  );
}
