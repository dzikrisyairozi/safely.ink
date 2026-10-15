// Renders the icon sets of web and dashboard from the pangolin path data.
// Run: pnpm --filter @repo/ui brand:icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import {
  pangolinBall,
  pangolinBallSmall,
  shapeSvg,
  type Shape,
} from '../src/components/brand/shapes.ts';

const INK = '#14182b';
const PAPER = '#faf7f0';
const root = resolve(import.meta.dirname, '../../..');

// Ink in a light browser, paper in a dark one.
const adaptiveSvg = shapeSvg(pangolinBallSmall, { color: INK }).replace(
  '<mask',
  `<style>rect{fill:${INK}}@media (prefers-color-scheme:dark){rect{fill:#ede8dc}}</style><mask`,
);

/** The ball centred on a square, `pad` of the side left empty on every edge. */
async function png(size: number, pad: number, background?: string) {
  const shape: Shape = size <= 48 ? pangolinBallSmall : pangolinBall;
  const inner = Math.round(size * (1 - 2 * pad));
  const edge = size - inner;
  const fill = background ?? { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp(Buffer.from(shapeSvg(shape, { color: INK })), { density: 1200 })
    .resize(inner, inner)
    .extend({
      top: Math.floor(edge / 2),
      bottom: Math.ceil(edge / 2),
      left: Math.floor(edge / 2),
      right: Math.ceil(edge / 2),
      background: fill,
    })
    .flatten(background ? { background } : false)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An .ico holding PNG images, which every current browser reads. */
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

function write(path: string, data: string | Buffer) {
  const file = resolve(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(path);
}

const favicon = ico(
  await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, data: await png(size, 0) })),
  ),
);
const apple = await png(180, 0.1, PAPER);
const icon192 = await png(192, 0.1, PAPER);
const icon512 = await png(512, 0.1, PAPER);
// Maskable icons are cropped to a circle of 80% of the side; at 0.1 padding
// the ball fills about 60% of the icon, inside that circle.
const maskable512 = await png(512, 0.1, PAPER);

write('apps/web/src/app/favicon.ico', favicon);
write('apps/web/src/app/icon.svg', adaptiveSvg);
write('apps/web/src/app/apple-icon.png', apple);
write('apps/web/public/icons/icon-192.png', icon192);
write('apps/web/public/icons/icon-512.png', icon512);
write('apps/web/public/icons/maskable-512.png', maskable512);

write('apps/dashboard/public/favicon/favicon.ico', favicon);
write('apps/dashboard/public/favicon/icon.svg', adaptiveSvg);
write('apps/dashboard/public/favicon/apple-touch-icon.png', apple);
write('apps/dashboard/public/favicon/icon-192.png', icon192);
write('apps/dashboard/public/favicon/icon-512.png', icon512);
write('apps/dashboard/public/favicon/maskable-512.png', maskable512);
write(
  'apps/dashboard/public/favicon/manifest.webmanifest',
  JSON.stringify(
    {
      name: 'safely.ink',
      short_name: 'safely.ink',
      start_url: '/',
      display: 'standalone',
      background_color: PAPER,
      theme_color: INK,
      icons: [
        { src: '/favicon/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/favicon/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/favicon/maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    null,
    2,
  ) + '\n',
);
