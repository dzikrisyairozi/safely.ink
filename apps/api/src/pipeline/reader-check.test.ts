import { expect, test } from 'vitest';
import { ReaderOutput } from '@repo/api-types';
import policy from '../../test/fixtures/reader-policy.json';
import receipt from '../../test/fixtures/reader-receipt.json';
import { checkReading } from './reader-check';

// The fixtures are Reader output as the model returns it, before any check.
const read = (changes: Partial<ReaderOutput> = {}) =>
  ReaderOutput.parse({ ...policy, ...changes });
const clause = (changes: Partial<ReaderOutput['clauses'][number]>) => ({
  number: null,
  heading: null,
  text: 'The insurer pays within 30 days.',
  gloss: null,
  page: 1,
  ...changes,
});

// What the user said the document is, before it was read.
const pick = { docType: 'insurance', jurisdiction: 'ID' } as const;
const check = (input: ReaderOutput, pageCount = 12) =>
  checkReading(input, pageCount, pick);

function accepted(reading: ReturnType<typeof checkReading>) {
  if (reading.status !== 'awaiting_confirmation') {
    throw new Error(`expected a readable document, got ${reading.status}`);
  }
  return reading;
}

test('a policy waits for confirmation with numbered clause IDs', () => {
  const { meta, clauses } = accepted(check(read()));

  expect(clauses.map((c) => c.id)).toEqual(['c-001', 'c-002', 'c-003']);
  expect(clauses[0]).toMatchObject({
    number: '1.1',
    heading: 'Pertanggungan',
    text: expect.stringContaining('Penanggung'),
    page: 2,
  });
  expect(meta).toMatchObject({
    docType: 'insurance',
    jurisdiction: 'ID',
    lawChecked: true,
    userRole: null,
    pageCount: 12,
  });
});

test('a restaurant receipt is rejected', () => {
  expect(check(ReaderOutput.parse(receipt), 1)).toEqual({
    status: 'rejected',
  });
});

test("the user's pick wins and the reader's finding is kept beside it", () => {
  const { meta } = accepted(
    checkReading(read({ docType: 'lease', jurisdiction: 'id' }), 12, {
      docType: 'insurance',
      jurisdiction: 'JP',
    }),
  );

  expect(meta).toMatchObject({
    docType: 'insurance',
    jurisdiction: 'JP',
    lawChecked: false,
    detected: { docType: 'lease', jurisdiction: 'ID' },
  });
});

test('the law is checked for the picked country, not the detected one', () => {
  const { meta } = accepted(
    checkReading(read({ jurisdiction: 'JP' }), 12, {
      docType: 'insurance',
      jurisdiction: 'SG',
    }),
  );

  expect(meta.lawChecked).toBe(true);
});

test('a global pick is checked against no country', () => {
  const { meta } = accepted(
    checkReading(read(), 12, { docType: 'other', jurisdiction: 'GLOBAL' }),
  );

  expect(meta).toMatchObject({ jurisdiction: 'GLOBAL', lawChecked: false });
});

test('terms and conditions are a document type of their own', () => {
  const { meta } = accepted(check(read({ docType: 'terms' })));

  expect(meta.detected.docType).toBe('terms');
});

test('a document type outside the tuned six becomes other', () => {
  const { meta } = accepted(check(read({ docType: 'Gym membership' })));

  expect(meta.detected.docType).toBe('other');
});

test('a tuned type is recognised whatever its case', () => {
  const { meta } = accepted(check(read({ docType: ' NDA ' })));

  expect(meta.detected.docType).toBe('nda');
});

test('a detected country is kept as its upper-case code, or empty', () => {
  expect(
    accepted(check(read({ jurisdiction: 'us ' }))).meta.detected.jurisdiction,
  ).toBe('US');
  expect(
    accepted(check(read({ jurisdiction: '' }))).meta.detected.jurisdiction,
  ).toBe('');
});

test('clauses without text or on a page that does not exist are dropped', () => {
  const clauses = [
    clause({ text: '   ' }),
    clause({ page: 0 }),
    clause({ page: 13 }),
    clause({ text: 'Kept.', page: 12 }),
  ];

  const reading = accepted(check(read({ clauses })));

  expect(reading.clauses).toEqual(
    [clause({ text: 'Kept.', page: 12 })].map((c) => ({ ...c, id: 'c-001' })),
  );
});

test('a contract with no usable clause fails instead of passing empty', () => {
  const clauses = [clause({ text: '' })];

  expect(check(read({ clauses }))).toEqual({
    status: 'failed',
  });
});

test('unreadable pages are reported once, in order, within the document', () => {
  const { meta } = accepted(check(read({ unreadablePages: [7, 3, 7, 0, 99] })));

  expect(meta.unreadablePages).toEqual([3, 7]);
});

test('the same reading always gives the same result and is not changed', () => {
  const input = read();
  const before = structuredClone(input);

  expect(check(input)).toEqual(check(input));
  expect(input).toEqual(before);
});
