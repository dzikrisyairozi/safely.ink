import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import {
  Bar,
  C,
  FONTS,
  useSceneFade,
  useSpring,
  useUnit,
  type SceneProps,
} from '../kit';

const PAGES = 7;

/** Pages slam onto a pile, the counter races to 40, the text blurs out. */
export function ColdOpen({ copy }: SceneProps) {
  const frame = useCurrentFrame();
  const { u, tall } = useUnit();
  const fade = useSceneFade(1, 12);
  const count = Math.round(
    interpolate(frame, [0, 70], [1, 40], { extrapolateRight: 'clamp' }),
  );
  const blur = interpolate(frame, [30, 90], [0, 1.2 * u], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const lines = [copy.cold.line1, copy.cold.line2, copy.cold.line3];

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill
        style={{
          alignItems: tall ? 'center' : 'flex-end',
          justifyContent: tall ? 'flex-start' : 'center',
          paddingRight: tall ? 0 : 12 * u,
          paddingTop: tall ? 14 * u : 0,
          filter: `blur(${blur}px)`,
        }}
      >
        <div style={{ position: 'relative', width: 34 * u, height: 46 * u }}>
          {Array.from({ length: PAGES }, (_, i) => (
            <Page key={i} index={i} u={u} />
          ))}
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 6 * u,
          top: 6 * u,
          fontFamily: FONTS.mono,
          fontSize: 2.4 * u,
          color: C.muted,
        }}
      >
        p. {String(count).padStart(2, '0')} / 40
      </div>
      <AbsoluteFill
        style={{
          justifyContent: tall ? 'flex-end' : 'center',
          padding: `${tall ? 18 * u : 0}px ${6 * u}px`,
        }}
      >
        <div style={{ position: 'relative', height: 24 * u }}>
          {lines.map((line, i) => (
            <Line key={line} index={i}>
              {line}
            </Line>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Page({ index, u }: { index: number; u: number }) {
  const drop = useSpring(index * 7, 14);
  const turn = (index % 2 ? 1 : -1) * (2 + index * 0.6);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 0.8 * u,
        boxShadow: `0 ${u}px ${3 * u}px rgba(0,0,0,0.12)`,
        padding: 3 * u,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.6 * u,
        transform: `translateY(${(1 - drop) * 80 * u}px) rotate(${turn * drop}deg)`,
      }}
    >
      <Bar u={u} width="55%" color={C.muted} />
      {Array.from({ length: 13 }, (_, i) => (
        <Bar key={i} u={u} width={`${70 + ((i * 37 + index * 11) % 30)}%`} />
      ))}
    </div>
  );
}

function Line({ index, children }: { index: number; children: string }) {
  const frame = useCurrentFrame();
  const { u } = useUnit();
  const start = index * 38;
  const opacity = interpolate(
    frame,
    [start, start + 8, start + 34, start + 40],
    [0, 1, 1, index === 2 ? 1 : 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
  const y = interpolate(frame, [start, start + 10], [3 * u, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <p
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        margin: 0,
        maxWidth: 80 * u,
        fontFamily: FONTS.serif,
        fontSize: 9 * u,
        lineHeight: 1.05,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      {children}
    </p>
  );
}
