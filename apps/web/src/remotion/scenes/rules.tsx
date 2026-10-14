import { AbsoluteFill } from 'remotion';
import { C, Chapter, FONTS, useSpring, useUnit, type SceneProps } from '../kit';

export const RULES = [
  { clause: '3.2', id: 'R-03', when: 'days_in_force < 30', then: 'no_benefit' },
  { clause: '5.7', id: 'R-09', when: 'cause.pre_existing', then: 'excluded' },
  { clause: '6.1', id: 'R-11', when: 'docs_days > 30', then: 'refused' },
  { clause: '8.2', id: 'R-14', when: 'notice_days > 7', then: 'refused' },
];

/** Each clause folds over into a typed rule that still names its clause. */
export function Rules({ copy }: SceneProps) {
  const { u } = useUnit();

  return (
    <Chapter step={2} title={copy.rules.title} caption={copy.rules.caption}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2.4 * u }}>
          {RULES.map((rule, i) => (
            <RuleRow key={rule.id} rule={rule} delay={14 + i * 18} />
          ))}
        </div>
      </AbsoluteFill>
    </Chapter>
  );
}

function RuleRow({
  rule,
  delay,
}: {
  rule: (typeof RULES)[number];
  delay: number;
}) {
  const { u } = useUnit();
  const fold = useSpring(delay, 16);
  const link = useSpring(delay + 12, 20);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2 * u,
        perspective: 120 * u,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.mono,
          fontSize: 2.4 * u,
          padding: `${1 * u}px ${2 * u}px`,
          border: `1px solid ${C.fg}`,
          borderRadius: 4 * u,
        }}
      >
        § {rule.clause}
      </span>
      <div style={{ width: 8 * u * link, height: 1, background: C.fg }} />
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 2.6 * u,
          padding: `${1.6 * u}px ${2.4 * u}px`,
          background: C.soft,
          borderRadius: 0.8 * u,
          transformOrigin: 'left center',
          transform: `rotateY(${(1 - fold) * 80}deg)`,
          opacity: fold,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: C.muted }}>{rule.id}</span>
        {'  '}
        {rule.when}
        <span style={{ color: C.muted }}> → </span>
        {rule.then}
      </div>
    </div>
  );
}
