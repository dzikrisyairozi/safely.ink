import { expect, test } from 'vitest';
import { general } from './general';
import { packFor } from './index';
import { insurance } from './insurance';
import { terms } from './terms';

test('insurance and terms have a pack of their own', () => {
  expect(packFor('insurance')).toBe(insurance);
  expect(packFor('terms')).toBe(terms);
});

test('every other type uses the general pack', () => {
  expect(packFor('other')).toBe(general);
  expect(packFor('loan')).toBe(general);
});

test('every pack names facts worth looking for', () => {
  for (const pack of [insurance, terms, general]) {
    expect(pack.facts.length).toBeGreaterThan(0);
  }
});
