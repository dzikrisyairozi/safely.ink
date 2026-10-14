import { Composition } from 'remotion';
import type { ReelProps } from './kit';
import {
  REEL_FORMATS,
  REEL_FPS,
  REEL_FRAMES,
  ReelComposition,
} from './ReelComposition';

const defaultProps: ReelProps = { locale: 'en', theme: 'dark' };

export function RemotionRoot() {
  return (
    <>
      {Object.entries(REEL_FORMATS).map(([format, size]) => (
        <Composition
          key={format}
          id={`reel-${format}`}
          component={ReelComposition}
          durationInFrames={REEL_FRAMES}
          fps={REEL_FPS}
          {...size}
          defaultProps={defaultProps}
        />
      ))}
    </>
  );
}
