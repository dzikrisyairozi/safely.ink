import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import id from './locales/id.json';
import { getT } from './translate';

function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) {
    return [prefix];
  }
  return Object.entries(obj).flatMap(([key, value]) =>
    flattenKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('locale parity', () => {
  it('en and id expose the exact same set of keys', () => {
    const enKeys = new Set(flattenKeys(en));
    const idKeys = new Set(flattenKeys(id));

    expect(
      [...enKeys].filter((k) => !idKeys.has(k)),
      'keys present in en.json but missing from id.json',
    ).toEqual([]);
    expect(
      [...idKeys].filter((k) => !enKeys.has(k)),
      'keys present in id.json but missing from en.json',
    ).toEqual([]);
  });
});

describe('getT', () => {
  it('keeps each language once both have been used', () => {
    const tEn = getT('en');
    const tId = getT('id');

    expect(tEn('hero.cta')).toBe(en.hero.cta);
    expect(tId('hero.cta')).toBe(id.hero.cta);
    expect(getT('en')('hero.cta')).toBe(en.hero.cta);
  });
});
