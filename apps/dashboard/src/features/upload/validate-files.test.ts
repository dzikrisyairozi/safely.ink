import { expect, test } from 'vitest';
import { contentTypeOf, validateFiles } from './validate-files';

const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const photo = (n: number) => file(`page-${n}.jpg`, 'image/jpeg');
const MB = 1024 * 1024;

test('one PDF is accepted', () => {
  expect(validateFiles([file('policy.pdf', 'application/pdf')])).toBeNull();
});

test('1 to 30 images are accepted, of every supported kind', () => {
  expect(
    validateFiles([
      file('a.jpg', 'image/jpeg'),
      file('b.png', 'image/png'),
      file('c.webp', 'image/webp'),
      file('d.heic', 'image/heic'),
    ]),
  ).toBeNull();
  expect(
    validateFiles(Array.from({ length: 30 }, (_, n) => photo(n))),
  ).toBeNull();
});

test('a HEIC photo is accepted when the browser reports no type', () => {
  expect(contentTypeOf(file('IMG_0042.HEIC', ''))).toBe('image/heic');
  expect(contentTypeOf(file('IMG_0043.heif', 'image/heif'))).toBe('image/heic');
});

test('31 images are too many', () => {
  expect(validateFiles(Array.from({ length: 31 }, (_, n) => photo(n)))).toBe(
    'too_many_files',
  );
});

test('a PDF cannot be combined with other files', () => {
  expect(validateFiles([file('policy.pdf', 'application/pdf'), photo(1)])).toBe(
    'mixed_input',
  );
  expect(
    validateFiles([
      file('a.pdf', 'application/pdf'),
      file('b.pdf', 'application/pdf'),
    ]),
  ).toBe('mixed_input');
});

test.each([
  ['notes.docx', 'application/msword'],
  ['clip.gif', 'image/gif'],
  ['unknown', ''],
])('%s is not an accepted type', (name, type) => {
  expect(validateFiles([file(name, type)])).toBe('unsupported_type');
});

test('more than 30 MB in total is too large', () => {
  const half = file('a.jpg', 'image/jpeg', 15 * MB);

  expect(validateFiles([half, half])).toBeNull();
  expect(validateFiles([half, half, photo(1)])).toBe('too_large');
});
