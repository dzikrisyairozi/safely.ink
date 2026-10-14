import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, Chapter, FONTS, useSpring, useUnit, type SceneProps } from '../kit';

/** Expectation and outcome pull apart; the red pen rings the gap. */
export function Compare({ copy }: SceneProps) {
  const frame = useCurrentFrame();
  const { u, tall } = useUnit();
  const split = useSpring(14, 20);
  const ring = interpolate(frame, [52, 82], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cite = useSpring(96, 18);
  const c = copy.compare;

  return (
    <Chapter step={4} title={c.title} caption={c.caption}>
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'center', gap: 6 * u }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: tall ? 'column' : 'row',
            alignItems: 'center',
            gap: (4 + split * 14) * u,
          }}
        >
          <Verdict label={c.expect} value={c.expectValue} />
          <div style={{ position: 'relative' }}>
            <Verdict label={c.outcome} value={c.outcomeValue} red />
            <svg
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                inset: `${-3 * u}px ${-5 * u}px`,
                width: `calc(100% + ${10 * u}px)`,
                height: `calc(100% + ${6 * u}px)`,
                overflow: 'visible',
              }}
            >
              <path
                d="M30 92 C -8 80, -6 18, 50 8 C 110 -6, 190 4, 196 44 C 202 84, 140 98, 90 97 C 60 96, 38 90, 26 78"
                fill="none"
                stroke={C.red}
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - ring}
              />
            </svg>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.6 * u,
            fontFamily: FONTS.mono,
            fontSize: 2 * u,
            padding: `${1.2 * u}px ${2 * u}px`,
            border: `1px solid ${C.border}`,
            borderRadius: 4 * u,
            opacity: cite,
            transform: `translateY(${(1 - cite) * 3 * u}px)`,
          }}
        >
          <span>✓ {c.citation}</span>
          <span style={{ color: C.muted }}>· {c.illustrative}</span>
        </div>
      </AbsoluteFill>
    </Chapter>
  );
}

function Verdict({
  label,
  value,
  red,
}: {
  label: string;
  value: string;
  red?: boolean;
}) {
  const { u } = useUnit();
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 2.2 * u,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: C.muted,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.serif,
          fontSize: 12 * u,
          lineHeight: 1.1,
          color: red ? C.red : C.fg,
        }}
      >
        {value}
      </div>
    </div>
  );
}
