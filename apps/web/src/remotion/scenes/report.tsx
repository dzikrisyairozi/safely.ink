import { AbsoluteFill } from 'remotion';
import { C, Chapter, FONTS, useSpring, useUnit, type SceneProps } from '../kit';

const TRAPS = [
  { key: 't1', clause: '8.2', weight: 1 },
  { key: 't2', clause: '3.2', weight: 0.7 },
  { key: 't3', clause: '5.7', weight: 0.45 },
] as const;

/** The grade stamps down; the traps rank themselves under it. */
export function Report({ copy }: SceneProps) {
  const { u, tall } = useUnit();
  const stamp = useSpring(10, 11);
  const r = copy.report;

  return (
    <Chapter step={5} title={r.title} caption={r.caption}>
      <AbsoluteFill
        style={{
          flexDirection: tall ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8 * u,
        }}
      >
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
            {r.grade}
          </div>
          <div
            style={{
              width: 26 * u,
              height: 26 * u,
              marginTop: 1.5 * u,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `${0.6 * u}px solid ${C.fg}`,
              borderRadius: '50%',
              fontFamily: FONTS.serif,
              fontSize: 18 * u,
              lineHeight: 1,
              opacity: Math.min(stamp * 1.5, 1),
              transform: `scale(${3 - 2 * stamp}) rotate(${(1 - stamp) * -24 - 6}deg)`,
            }}
          >
            C
          </div>
        </div>
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 2.4 * u,
            width: tall ? 80 * u : 70 * u,
          }}
        >
          {TRAPS.map((trap, i) => (
            <TrapRow
              key={trap.key}
              index={i}
              text={r.traps[trap.key]}
              clause={trap.clause}
              weight={trap.weight}
            />
          ))}
        </ol>
      </AbsoluteFill>
    </Chapter>
  );
}

function TrapRow({
  index,
  text,
  clause,
  weight,
}: {
  index: number;
  text: string;
  clause: string;
  weight: number;
}) {
  const { u } = useUnit();
  const s = useSpring(40 + index * 16, 16);
  return (
    <li style={{ opacity: s, transform: `translateX(${(1 - s) * 12 * u}px)` }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2 * u,
          fontSize: 3 * u,
        }}
      >
        <span>
          <span
            style={{
              fontFamily: FONTS.mono,
              color: C.muted,
              marginRight: 1.6 * u,
            }}
          >
            {index + 1}
          </span>
          {text}
        </span>
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 2 * u,
            color: C.muted,
            whiteSpace: 'nowrap',
          }}
        >
          § {clause}
        </span>
      </div>
      <div
        style={{
          marginTop: 1 * u,
          height: 0.8 * u,
          borderRadius: u,
          background: C.soft,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${weight * 100 * s}%`,
            borderRadius: u,
            background: C.red,
            opacity: 0.4 + weight * 0.6,
          }}
        />
      </div>
    </li>
  );
}
