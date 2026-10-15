import {
  AbsoluteFill,
  interpolate,
  random,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { C, Chapter, FONTS, useUnit, type SceneProps } from '../kit';
import { RULES } from './rules';

// Facts, written the way the engine sees them. Three break a rule.
const SCENARIOS = [
  'notice_days = 3',
  'days_in_force = 12',
  'notice_days = 11',
  'docs_days = 9',
  'premium_late = 2',
  'cause = accident',
  'docs_days = 21',
  'days_in_force = 64',
  'cause.pre_existing',
  'notice_days = 6',
  'stay_hours = 23',
  'docs_days = 14',
  'claim = 0.9 × limit',
  'days_in_force = 200',
  'provider = network',
  'notice_days = 1',
  'territory = abroad',
  'docs_days = 28',
];
const FAILS = new Set([1, 2, 8]);
const HIT_TARGET: Record<number, number> = { 1: 0, 2: 3, 8: 1 };

/** Scenarios fly in from every side and strike the rules; a few crack. */
export function Fuzz({ copy }: SceneProps) {
  const frame = useCurrentFrame();
  const { u, tall } = useUnit();
  const { width, height } = useVideoConfig();
  const ran = SCENARIOS.filter((_, i) => frame > 20 + i * 7 + 18).length;

  return (
    <Chapter step={3} title={copy.fuzz.title} caption={copy.fuzz.caption}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 * u }}>
          {RULES.map((rule, r) => {
            const struck = SCENARIOS.some(
              (_, i) =>
                FAILS.has(i) && HIT_TARGET[i] === r && frame > 20 + i * 7 + 18,
            );
            return (
              <div
                key={rule.id}
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: (tall ? 2 : 2.4) * u,
                  padding: `${1.4 * u}px ${(tall ? 1.6 : 2.4) * u}px`,
                  borderRadius: 0.8 * u,
                  background: C.soft,
                  outline: struck ? `2px solid ${C.red}` : 'none',
                  color: struck ? C.red : C.fg,
                }}
              >
                {rule.id} {rule.when} → {rule.then}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      {SCENARIOS.map((label, i) => {
        const start = 20 + i * 7;
        const t = interpolate(frame, [start, start + 18], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const angle = random(`a${i}`) * Math.PI * 2;
        const reach = Math.max(width, height) * 0.62;
        const from = { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
        const fails = FAILS.has(i);
        // Passing cards settle on a ring around the rules; failing ones stick
        // beside the rule they break (below the rules in the tall cut).
        const ring =
          (i / SCENARIOS.length) * Math.PI * 2 + random(`r${i}`) * 0.3;
        const rest = fails
          ? tall
            ? { x: 0, y: (18 + [...FAILS].indexOf(i) * 5.5) * u }
            : { x: 40 * u, y: (HIT_TARGET[i]! - 1.5) * 7.4 * u }
          : {
              x: Math.cos(ring) * (tall ? 34 : 62) * u,
              y: Math.sin(ring) * (tall ? 46 : 26) * u,
            };
        const landed = t >= 1;
        const x = from.x + (rest.x - from.x) * t;
        const y = from.y + (rest.y - from.y) * t;
        return (
          <div
            key={label}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              fontFamily: FONTS.mono,
              fontSize: 1.8 * u,
              padding: `${0.6 * u}px ${1.2 * u}px`,
              borderRadius: 0.6 * u,
              border: `1px solid ${fails && landed ? C.red : C.border}`,
              background: C.card,
              color: fails && landed ? C.red : C.muted,
              opacity: t === 0 ? 0 : landed && !fails ? 0.55 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {landed ? (fails ? '✕ ' : '✓ ') : ''}
            {label}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          right: 6 * u,
          top: 6.6 * u,
          fontFamily: FONTS.mono,
          fontSize: 2.4 * u,
          color: C.muted,
        }}
      >
        {String(ran).padStart(2, '0')} / {SCENARIOS.length}
      </div>
    </Chapter>
  );
}
