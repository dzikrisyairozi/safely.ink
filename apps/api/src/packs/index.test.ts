import { expect, test } from 'vitest';
import { WrittenStrategy } from '@repo/api-types';
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

test('every pack has seeds for each strategy the model writes', () => {
  for (const pack of [insurance, terms, general]) {
    for (const strategy of WrittenStrategy.options) {
      expect(pack.seeds[strategy].length).toBeGreaterThan(0);
    }
  }
});

test('every pack says what people in that role take for granted', () => {
  for (const pack of [insurance, terms, general]) {
    expect(pack.hints.length).toBeGreaterThanOrEqual(4);
  }
});
