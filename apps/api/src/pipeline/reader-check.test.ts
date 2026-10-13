import { expect, test } from 'vitest';
import { ReaderOutput } from '@repo/api-types';
import policy from '../../test/fixtures/reader-policy.json';
import receipt from '../../test/fixtures/reader-receipt.json';
import { checkReading } from './reader-check';

// The fixtures are Reader output as the model returns it, before any check.
const LAW = ['ID', 'SG', 'AU'];
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

function accepted(reading: ReturnType<typeof checkReading>) {
  if (reading.status !== 'awaiting_confirmation') {
    throw new Error(`expected a readable document, got ${reading.status}`);
  }
  return reading;
}

test('a policy waits for confirmation with numbered clause IDs', () => {
  const { meta, clauses } = accepted(checkReading(read(), 12, LAW));

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
  expect(checkReading(ReaderOutput.parse(receipt), 1, LAW)).toEqual({
    status: 'rejected',
  });
});

test('a document type outside the tuned five becomes other', () => {
  const { meta } = accepted(
    checkReading(read({ docType: 'Gym membership' }), 12, LAW),
  );

  expect(meta.docType).toBe('other');
});

test('a tuned type is recognised whatever its case', () => {
  const { meta } = accepted(checkReading(read({ docType: ' NDA ' }), 12, LAW));

  expect(meta.docType).toBe('nda');
});

test('a jurisdiction without a law check is kept and marked unchecked', () => {
  const { meta } = accepted(
    checkReading(read({ jurisdiction: 'my' }), 12, LAW),
  );

  expect(meta).toMatchObject({ jurisdiction: 'MY', lawChecked: false });
});

test('clauses without text or on a page that does not exist are dropped', () => {
  const clauses = [
    clause({ text: '   ' }),
    clause({ page: 0 }),
    clause({ page: 13 }),
    clause({ text: 'Kept.', page: 12 }),
  ];

  const reading = accepted(checkReading(read({ clauses }), 12, LAW));

  expect(reading.clauses).toEqual(
    [clause({ text: 'Kept.', page: 12 })].map((c) => ({ ...c, id: 'c-001' })),
  );
});

test('a contract with no usable clause fails instead of passing empty', () => {
  const clauses = [clause({ text: '' })];

  expect(checkReading(read({ clauses }), 12, LAW)).toEqual({
    status: 'failed',
  });
});

test('unreadable pages are reported once, in order, within the document', () => {
  const { meta } = accepted(
    checkReading(read({ unreadablePages: [7, 3, 7, 0, 99] }), 12, LAW),
  );

  expect(meta.unreadablePages).toEqual([3, 7]);
});

test('the same reading always gives the same result and is not changed', () => {
  const input = read();
  const before = structuredClone(input);

  expect(checkReading(input, 12, LAW)).toEqual(checkReading(input, 12, LAW));
  expect(input).toEqual(before);
});
