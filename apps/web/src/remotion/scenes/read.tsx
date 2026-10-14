import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import {
  Bar,
  C,
  Chapter,
  FONTS,
  useSpring,
  useUnit,
  type SceneProps,
} from '../kit';

export const CLAUSE_IDS = ['1.1', '2.4', '3.2', '5.7', '6.1', '7.3', '8.2'];

/** A scan line passes down the page; each line it reaches becomes a clause. */
export function Read({ copy }: SceneProps) {
  const frame = useCurrentFrame();
  const { u, tall } = useUnit();
  const scan = interpolate(frame, [20, 120], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <Chapter step={1} title={copy.read.title} caption={copy.read.caption}>
      <AbsoluteFill
        style={{
          flexDirection: tall ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8 * u,
          paddingTop: tall ? 6 * u : 0,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 34 * u,
            height: 44 * u,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 0.8 * u,
            padding: 3 * u,
            display: 'flex',
            flexDirection: 'column',
            gap: 2.2 * u,
            overflow: 'hidden',
          }}
        >
          {CLAUSE_IDS.map((id, i) => (
            <div
              key={id}
              style={{ display: 'flex', gap: 1.2 * u, alignItems: 'center' }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 1.7 * u,
                  color: C.fg,
                  opacity: scan > (i + 0.5) / CLAUSE_IDS.length ? 1 : 0.15,
                  width: 4 * u,
                }}
              >
                {id}
              </span>
              <Bar u={u} width={`${60 + ((i * 41) % 35)}%`} />
            </div>
          ))}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${scan * 100}%`,
              height: 0.4 * u,
              background: C.fg,
              opacity: scan > 0 && scan < 1 ? 0.6 : 0,
              boxShadow: `0 0 ${2 * u}px ${C.fg}`,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: tall ? 'row' : 'column',
            flexWrap: 'wrap',
            gap: 1.4 * u,
            maxWidth: tall ? 70 * u : 'none',
          }}
        >
          {CLAUSE_IDS.map((id, i) => (
            <Chip key={id} id={id} delay={28 + i * 13} />
          ))}
        </div>
      </AbsoluteFill>
    </Chapter>
  );
}

function Chip({ id, delay }: { id: string; delay: number }) {
  const { u } = useUnit();
  const s = useSpring(delay, 15);
  return (
    <div
      style={{
        fontFamily: FONTS.mono,
        fontSize: 2.4 * u,
        padding: `${1 * u}px ${2 * u}px`,
        border: `1px solid ${C.fg}`,
        borderRadius: 4 * u,
        opacity: s,
        transform: `translateX(${(1 - s) * -10 * u}px)`,
      }}
    >
      § {id}
    </div>
  );
}
