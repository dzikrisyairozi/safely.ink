import { expect, test } from 'vitest';
import { loadConfig } from './config';

test('defaults apply when the environment is empty', () => {
  const config = loadConfig({});

  expect(config.PORT).toBe(3001);
  expect(config.ALLOWED_ORIGIN).toBe('http://localhost:5174');
});

test('values from the environment win over defaults', () => {
  const config = loadConfig({
    PORT: '8080',
    ALLOWED_ORIGIN: 'https://policy-police.web.app',
  });

  expect(config.PORT).toBe(8080);
  expect(config.ALLOWED_ORIGIN).toBe('https://policy-police.web.app');
});

test('an invalid value stops startup and names the variable', () => {
  expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  expect(() => loadConfig({ ALLOWED_ORIGIN: 'not a url' })).toThrow(
    /ALLOWED_ORIGIN/,
  );
});
