import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Pangolin } from '@repo/ui/components/brand/pangolin';
import {
  C,
  FONTS,
  useSceneFade,
  useSpring,
  useUnit,
  type SceneProps,
} from '../kit';

const WORD = 'safely.ink';

/** The ball rolls in, opens into the walking pangolin, the name settles. */
export function Mark({ copy }: SceneProps) {
  const frame = useCurrentFrame();
  const { u } = useUnit();
  const fade = useSceneFade(8, 12);
  const roll = useSpring(0, 20);
  const open = interpolate(frame, [42, 62], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tagline = useSpring(84);

  return (
    <AbsoluteFill
      style={{ opacity: fade, alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ position: 'relative', width: 44 * u, height: 28 * u }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 22 * u,
            height: 22 * u,
            marginLeft: -11 * u,
            marginTop: -11 * u,
            opacity: 1 - open,
            transform: `translateX(${(1 - roll) * -90 * u}px) rotate(${(1 - roll) * -540}deg) scale(${1 - open * 0.3})`,
            color: C.fg,
          }}
        >
          <Pangolin variant="ball" />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: open,
            transform: `scale(${0.7 + open * 0.3})`,
            color: C.fg,
          }}
        >
          <Pangolin />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 4 * u,
          fontFamily: FONTS.serif,
          fontSize: 11 * u,
          lineHeight: 1,
        }}
      >
        {WORD.split('').map((letter, i) => (
          <Letter key={i} index={i}>
            {letter}
          </Letter>
        ))}
      </div>
      <p
        style={{
          margin: `${3 * u}px 0 0`,
          fontFamily: FONTS.mono,
          fontSize: 2.6 * u,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: C.muted,
          opacity: tagline,
        }}
      >
        {copy.mark.tagline}
      </p>
    </AbsoluteFill>
  );
}

function Letter({ index, children }: { index: number; children: string }) {
  const { u } = useUnit();
  const s = useSpring(58 + index * 2.5, 16);
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: s,
        transform: `translateY(${(1 - s) * 4 * u}px)`,
      }}
    >
      {children}
    </span>
  );
}
