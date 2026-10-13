import { expect, test } from 'vitest';
import { ReaderOutput } from '@repo/api-types';
import policy from '../../test/fixtures/reader-policy.json';
import { mergeReadings, pageWindows } from './reader';

// The model call itself is checked by hand with a real key; see the runbook.
const reading = (changes: Partial<ReaderOutput>) =>
  ReaderOutput.parse({ ...policy, ...changes });
const clauseOn = (page: number) => ({ ...policy.clauses[0]!, page });

test('a short document is read in one window', () => {
  expect(pageWindows(12)).toEqual([{ from: 1, to: 12 }]);
  expect(pageWindows(40)).toEqual([{ from: 1, to: 40 }]);
});

test('a long document is read in windows of 40 pages with no gap or overlap', () => {
  expect(pageWindows(100)).toEqual([
    { from: 1, to: 40 },
    { from: 41, to: 80 },
    { from: 81, to: 100 },
  ]);
  expect(pageWindows(41)).toEqual([
    { from: 1, to: 40 },
    { from: 41, to: 41 },
  ]);
});

test('windows are joined with clauses in page order', () => {
  const merged = mergeReadings([
    reading({ clauses: [clauseOn(3), clauseOn(40)], unreadablePages: [7] }),
    reading({ clauses: [clauseOn(41)], unreadablePages: [44] }),
  ]);

  expect(merged.clauses.map((clause) => clause.page)).toEqual([3, 40, 41]);
  expect(merged.unreadablePages).toEqual([7, 44]);
  expect(merged.title).toBe(policy.title);
});

test('the jurisdiction is taken from the first window that found one', () => {
  const merged = mergeReadings([
    reading({ jurisdiction: '' }),
    reading({ jurisdiction: 'SG' }),
  ]);

  expect(merged.jurisdiction).toBe('SG');
});

test('a party named in two windows is listed once', () => {
  const guarantor = { name: 'Siti Rahma', role: 'guarantor' };

  const merged = mergeReadings([
    reading({}),
    reading({ parties: [...policy.parties, guarantor] }),
  ]);

  expect(merged.parties).toEqual([...policy.parties, guarantor]);
});

test('no reading at all is an error, not an empty document', () => {
  expect(() => mergeReadings([])).toThrow();
});
