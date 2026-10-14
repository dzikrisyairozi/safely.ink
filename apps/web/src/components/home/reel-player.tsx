'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import type { ReelProps } from '@/remotion/kit';
import {
  REEL_FORMATS,
  REEL_FPS,
  REEL_FRAMES,
  Showreel,
} from '@/remotion/Showreel';

// Loaded on demand by showreel.tsx, so Remotion is never in the first load.
export default function ReelPlayer({
  format,
  playerRef,
  onReady,
  ...inputProps
}: ReelProps & {
  format: keyof typeof REEL_FORMATS;
  playerRef: RefObject<PlayerRef>;
  onReady: () => void;
}) {
  const size = REEL_FORMATS[format];
  const ready = useRef(onReady);

  useEffect(() => ready.current(), []);

  return (
    <Player
      ref={playerRef}
      component={Showreel}
      inputProps={inputProps}
      durationInFrames={REEL_FRAMES}
      fps={REEL_FPS}
      compositionWidth={size.width}
      compositionHeight={size.height}
      style={{ width: '100%', height: '100%' }}
      loop
      initiallyMuted
      clickToPlay={false}
      acknowledgeRemotionLicense
    />
  );
}
