import { readdirSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { Versions } from '@repo/api-types';
import { config } from './config';
import { versions } from './versions';

const agents = readdirSync(new URL('./agents/', import.meta.url))
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => name.slice(0, -'.ts'.length));

test('the versions name the models and hash every agent, the packs and the engine', () => {
  expect(Versions.parse(versions)).toEqual(versions);
  expect(versions.models).toEqual(config.models);
  expect(Object.keys(versions.prompts).sort()).toEqual(agents.sort());
  for (const hash of [
    ...Object.values(versions.prompts),
    versions.packs,
    versions.engine,
  ]) {
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  }
  expect(versions.corpus).toBeNull();
});

test('the versions are worked out the same way each time the code loads', async () => {
  vi.resetModules();
  const again = await import('./versions');

  expect(again.versions).toEqual(versions);
});
