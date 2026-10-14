import { expect, test } from 'vitest';
import { DocType, WrittenStrategy } from '@repo/api-types';
import { employment } from './employment';
import { general } from './general';
import { packFor } from './index';
import { insurance } from './insurance';
import { lease } from './lease';
import { loan } from './loan';
import { nda } from './nda';
import { terms } from './terms';

const own = { employment, insurance, lease, loan, nda, terms };
const packs = [...Object.values(own), general];

test('a type with a pack of its own gets that pack', () => {
  for (const [docType, pack] of Object.entries(own)) {
    expect(packFor(DocType.parse(docType))).toBe(pack);
  }
});

test('only `other` uses the general pack', () => {
  expect(packFor('other')).toBe(general);
});

test('every pack has seeds for each strategy the model writes', () => {
  for (const pack of packs) {
    for (const strategy of WrittenStrategy.options) {
      expect(pack.seeds[strategy].length).toBeGreaterThan(0);
    }
  }
});

test('every pack says what people in that role take for granted', () => {
  for (const pack of packs) {
    expect(pack.hints.length).toBeGreaterThanOrEqual(4);
  }
});
