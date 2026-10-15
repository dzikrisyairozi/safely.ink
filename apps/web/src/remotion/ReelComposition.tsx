import { AbsoluteFill, Series } from 'remotion';
import { C, FONTS, reelCopy, type ReelProps, type SceneProps } from './kit';
import { ColdOpen } from './scenes/cold-open';
import { Compare } from './scenes/compare';
import { EndCard } from './scenes/end-card';
import { Fuzz } from './scenes/fuzz';
import { Mark } from './scenes/mark';
import { Read } from './scenes/read';
import { Report } from './scenes/report';
import { Rules } from './scenes/rules';

export const REEL_FPS = 30;

const SCENES: {
  id: string;
  frames: number;
  Scene: (p: SceneProps) => React.ReactNode;
}[] = [
  { id: 'cold-open', frames: 120, Scene: ColdOpen },
  { id: 'mark', frames: 135, Scene: Mark },
  { id: 'read', frames: 165, Scene: Read },
  { id: 'rules', frames: 165, Scene: Rules },
  { id: 'fuzz', frames: 210, Scene: Fuzz },
  { id: 'compare', frames: 165, Scene: Compare },
  { id: 'report', frames: 165, Scene: Report },
  { id: 'end', frames: 135, Scene: EndCard },
];

export const REEL_FRAMES = SCENES.reduce((sum, s) => sum + s.frames, 0);

export const REEL_FORMATS = {
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1350 },
} as const;

/** The whole reel. `theme` picks the token set, so it matches the page. */
export function ReelComposition({ locale, theme }: ReelProps) {
  const copy = reelCopy(locale);

  return (
    <AbsoluteFill
      className={theme}
      style={{ background: C.bg, color: C.fg, fontFamily: FONTS.sans }}
    >
      <Series>
        {SCENES.map(({ id, frames, Scene }) => (
          <Series.Sequence key={id} durationInFrames={frames} premountFor={10}>
            <Scene copy={copy} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}
