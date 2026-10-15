import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import {
  pangolin,
  pangolinBall,
  shapeSvg,
} from '@repo/ui/components/brand/shapes';
import { SITE_NAME } from '@/lib/site';

export const OG_SIZE = { width: 1200, height: 630 };

// The dark tokens of @repo/tailwind-config; image rendering has no CSS variables.
const INK = '#0e1120';
const PAPER = '#ede8dc';
const MUTED = '#a3a6b4';
const RULE = '#2a2f47';

const font = (file: string) =>
  readFile(join(process.cwd(), 'public/fonts', file));

const svgSrc = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** The 1200x630 card shared by every page: kicker, title, the mark. */
export async function ogImage({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}) {
  const [serif, sans, mono] = await Promise.all([
    font('Newsreader-SemiBold.ttf'),
    font('Geist-Regular.ttf'),
    font('GeistMono-Medium.ttf'),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        backgroundColor: INK,
        color: PAPER,
        fontFamily: 'Geist',
        position: 'relative',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={svgSrc(shapeSvg(pangolin, { color: RULE }))}
        width={560}
        height={358}
        alt=""
        style={{ position: 'absolute', right: -40, bottom: -30 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={svgSrc(shapeSvg(pangolinBall, { color: PAPER }))}
          width={48}
          height={48}
          alt=""
        />
        <div style={{ fontFamily: 'Newsreader', fontSize: 36 }}>
          {SITE_NAME}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          maxWidth: 900,
        }}
      >
        <div
          style={{
            fontFamily: 'Geist Mono',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: MUTED,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            fontFamily: 'Newsreader',
            fontSize: title.length > 60 ? 60 : 76,
            lineHeight: 1.08,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Newsreader', data: serif, weight: 600, style: 'normal' },
        { name: 'Geist', data: sans, weight: 400, style: 'normal' },
        { name: 'Geist Mono', data: mono, weight: 500, style: 'normal' },
      ],
    },
  );
}
