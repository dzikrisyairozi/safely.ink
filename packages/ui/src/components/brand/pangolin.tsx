import { useId } from 'react';
import {
  pangolin,
  pangolinBall,
  pangolinBallSmall,
  type Shape,
} from './shapes';

const variants = {
  profile: pangolin,
  ball: pangolinBall,
  'ball-small': pangolinBallSmall,
} satisfies Record<string, Shape>;

export type PangolinVariant = keyof typeof variants;

/**
 * The pangolin mark in the current text colour. Decorative unless `title` is
 * given. Use `ball-small` at 48 px and below.
 */
export function Pangolin({
  variant = 'profile',
  title,
  className,
}: {
  variant?: PangolinVariant;
  title?: string;
  className?: string;
}) {
  // useId can contain characters that are awkward inside url(#...)
  const maskId = `pangolin${useId().replace(/[^\w-]/g, '')}`;
  const shape = variants[variant];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={shape.viewBox}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <mask id={maskId} maskUnits="userSpaceOnUse">
        {shape.layers.map(({ kind, d }, i) =>
          kind === 'cut' ? (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="#000"
              strokeWidth={shape.cutWidth}
              strokeLinecap="round"
            />
          ) : (
            <path key={i} d={d} fill={kind === 'fill' ? '#fff' : '#000'} />
          ),
        )}
      </mask>
      <rect
        width="100%"
        height="100%"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
