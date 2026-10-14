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

// The page gets its fonts from next/font; the renderer loads the same families.
const fonts = [
  ['Newsreader', 'Newsreader-SemiBold.ttf', '600', 'normal'],
  ['Newsreader', 'Newsreader-MediumItalic.ttf', '500', 'italic'],
  ['Geist', 'Geist-Regular.ttf', '400', 'normal'],
  ['Geist', 'Geist-SemiBold.ttf', '600', 'normal'],
  ['Geist Mono', 'GeistMono-Medium.ttf', '500', 'normal'],
] as const;

const handle = delayRender('fonts');
Promise.all(
  fonts.map(async ([family, file, weight, style]) => {
    const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, {
      weight,
      style,
    });
    document.fonts.add(await face.load());
  }),
).then(() => continueRender(handle));

registerRoot(RemotionRoot);
