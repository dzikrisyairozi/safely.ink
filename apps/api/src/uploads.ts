import { PDFDocument } from 'pdf-lib';
import { config } from './config';
import { bucket } from './firebase';

export type Upload = { name: string; mimeType: string; bytes: Buffer };

export type UploadError =
  | 'file_missing'
  | 'unsupported_type'
  | 'mixed_input'
  | 'too_large'
  | 'too_many_pages';

export type Uploads =
  | { ok: true; files: Upload[]; pageCount: number }
  | { ok: false; code: UploadError };

const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'];

/**
 * The real type, from the first bytes. The content type in Storage is
 * whatever the browser declared, so it is not used.
 */
export function sniffType(bytes: Buffer): string | null {
  const ascii = (from: number, to: number) =>
    bytes.subarray(from, to).toString('latin1');

  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(8, 12)))
    return 'image/heic';
  return null;
}

/** F-UP-1 and F-UP-2: one PDF or 1 to 30 images, within the limits. */
export async function inspectUploads(
  files: { name: string; bytes: Buffer }[],
): Promise<Uploads> {
  const { uploadMaxBytes, uploadMaxPages } = config.limits;
  const fail = (code: UploadError) => ({ ok: false, code }) as const;

  const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (total > uploadMaxBytes) return fail('too_large');

  const typed: Upload[] = [];
  for (const file of files) {
    const mimeType = sniffType(file.bytes);
    if (!mimeType) return fail('unsupported_type');
    typed.push({ ...file, mimeType });
  }

  const pdf = typed.find((file) => file.mimeType === 'application/pdf');
  if (!pdf) return { ok: true, files: typed, pageCount: typed.length };
  if (typed.length > 1) return fail('mixed_input');

  let pageCount: number;
  try {
    // Only the page tree is read, so a password on the content does not matter.
    const doc = await PDFDocument.load(pdf.bytes, { ignoreEncryption: true });
    pageCount = doc.getPageCount();
  } catch {
    return fail('unsupported_type');
  }
  if (pageCount > uploadMaxPages) return fail('too_many_pages');
  return { ok: true, files: typed, pageCount };
}

/** Fetches the caller's files for one analysis and checks them. */
export async function loadUploads(
  uid: string,
  analysisId: string,
  names: string[],
): Promise<Uploads> {
  const objects = names.map((name) => ({
    name,
    object: bucket().file(`uploads/${uid}/${analysisId}/${name}`),
  }));

  // Sizes first, so an oversized upload is refused without downloading it.
  let total = 0;
  for (const { object } of objects) {
    const [exists] = await object.exists();
    if (!exists) return { ok: false, code: 'file_missing' };
    const [metadata] = await object.getMetadata();
    total += Number(metadata.size);
  }
  if (total > config.limits.uploadMaxBytes)
    return { ok: false, code: 'too_large' };

  const files = await Promise.all(
    objects.map(async ({ name, object }) => ({
      name,
      bytes: (await object.download())[0],
    })),
  );
  return inspectUploads(files);
}
