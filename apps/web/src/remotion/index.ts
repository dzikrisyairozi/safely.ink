// Entry for the Remotion CLI (studio and renders). The page plays the same
// composition through @remotion/player and never loads this file.
import {
  continueRender,
  delayRender,
  registerRoot,
  staticFile,
} from 'remotion';
import '@repo/tailwind-config/tokens.css';
import { RemotionRoot } from './Root';

// The page gets its fonts from next/font; the renderer loads the same families
// in the one weight the scenes use, so the MP4 and posters match the player.
const fonts = [
  ['Newsreader', 'Newsreader-Regular.ttf'],
  ['Geist', 'Geist-Regular.ttf'],
  ['Geist Mono', 'GeistMono-Regular.ttf'],
] as const;

const handle = delayRender('fonts');
Promise.all(
  fonts.map(async ([family, file]) => {
    const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`);
    document.fonts.add(await face.load());
  }),
).then(() => continueRender(handle));

registerRoot(RemotionRoot);
