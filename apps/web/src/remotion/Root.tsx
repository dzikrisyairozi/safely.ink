import { Composition } from 'remotion';
import type { ReelProps } from './kit';
import { REEL_FORMATS, REEL_FPS, REEL_FRAMES, Showreel } from './Showreel';

const defaultProps: ReelProps = { locale: 'en', theme: 'dark' };

export function RemotionRoot() {
  return (
    <>
      {Object.entries(REEL_FORMATS).map(([format, size]) => (
        <Composition
          key={format}
          id={`reel-${format}`}
          component={Showreel}
          durationInFrames={REEL_FRAMES}
          fps={REEL_FPS}
          {...size}
          defaultProps={defaultProps}
        />
      ))}
    </>
  );
}
