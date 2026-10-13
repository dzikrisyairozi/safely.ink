import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';
import { inspectUploads, sniffType } from './uploads';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = Buffer.from('\x89PNG\r\n\x1a\n0000', 'latin1');
const webp = Buffer.from('RIFF0000WEBPVP8 ', 'latin1');
const heic = Buffer.from('\0\0\0\x18ftypheic0000', 'latin1');

async function pdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let n = 0; n < pages; n++) doc.addPage([100, 100]);
  return Buffer.from(await doc.save());
}

const page = (bytes: Buffer, n = 0) => ({ name: `${n}-page`, bytes });

test.each([
  ['image/jpeg', jpeg],
  ['image/png', png],
  ['image/webp', webp],
  ['image/heic', heic],
])('%s is recognised from its first bytes', (mimeType, bytes) => {
  expect(sniffType(bytes)).toBe(mimeType);
});

test('a PDF is recognised and its pages are counted', async () => {
  const result = await inspectUploads([page(await pdf(3))]);

  expect(result).toMatchObject({ ok: true, pageCount: 3 });
});

test('each image counts as one page, in the order given', async () => {
  const result = await inspectUploads([page(jpeg, 0), page(png, 1)]);

  expect(result).toMatchObject({
    ok: true,
    pageCount: 2,
    files: [{ mimeType: 'image/jpeg' }, { mimeType: 'image/png' }],
  });
});

test('a file that only claims to be a PDF by name is refused', async () => {
  const text = { name: '0-policy.pdf', bytes: Buffer.from('hello world') };

  expect(await inspectUploads([text])).toEqual({
    ok: false,
    code: 'unsupported_type',
  });
});

test('a broken PDF is refused', async () => {
  const broken = Buffer.from('%PDF-1.7 this is not a document');

  expect(await inspectUploads([page(broken)])).toEqual({
    ok: false,
    code: 'unsupported_type',
  });
});

test('a PDF cannot be mixed with other files', async () => {
  const result = await inspectUploads([page(await pdf(1), 0), page(jpeg, 1)]);

  expect(result).toEqual({ ok: false, code: 'mixed_input' });
});

test('a PDF of 101 pages is over the limit', async () => {
  expect(await inspectUploads([page(await pdf(101))])).toEqual({
    ok: false,
    code: 'too_many_pages',
  });
  expect(await inspectUploads([page(await pdf(100))])).toMatchObject({
    ok: true,
  });
});

test('more than 30 MB in total is over the limit', async () => {
  const big = Buffer.concat([jpeg, Buffer.alloc(16 * 1024 * 1024)]);

  expect(await inspectUploads([page(big, 0), page(big, 1)])).toEqual({
    ok: false,
    code: 'too_large',
  });
});
