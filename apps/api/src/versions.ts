import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type { Versions } from '@repo/api-types';
import { config } from './config';

const hash = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

// The source files of a folder next to this one, tests left out, by name.
function sources(folder: string) {
  const dir = new URL(`./${folder}/`, import.meta.url);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()
    .map((name) => ({
      name: name.slice(0, -'.ts'.length),
      text: readFileSync(new URL(name, dir), 'utf8'),
    }));
}

/**
 * What the running code would produce an analysis with. The image runs the
 * source through tsx, so the files read here are the ones that run. The
 * model IDs are previews that can change under the same name, which the
 * stage's `updatedAt` dates.
 */
export const versions: Versions = {
  models: { ...config.models },
  prompts: Object.fromEntries(
    sources('agents').map(({ name, text }) => [name, hash(text)]),
  ),
  packs: hash(
    sources('packs')
      .map(({ text }) => text)
      .join('\n'),
  ),
  engine: hash(
    [
      ...sources('engine').map(({ text }) => text),
      JSON.stringify(config.scoring),
    ].join('\n'),
  ),
  corpus: null,
};
