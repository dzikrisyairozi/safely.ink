import { UPLOAD_LIMITS } from '@repo/api-types';

export type FileError =
  'unsupported_type' | 'mixed_input' | 'too_many_files' | 'too_large';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic',
};

/**
 * The content type to upload with, or null when the file is not accepted.
 * By extension when the browser gives no type, which most do for HEIC.
 */
export function contentTypeOf(file: File): string | null {
  const type =
    file.type === 'image/heif'
      ? 'image/heic'
      : file.type ||
        BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''];
  return type === 'application/pdf' || IMAGE_TYPES.includes(type ?? '')
    ? (type ?? null)
    : null;
}

/** F-UP-1 and F-UP-2. The API checks again on the real bytes. */
export function validateFiles(files: File[]): FileError | null {
  const types = files.map(contentTypeOf);
  if (types.includes(null)) return 'unsupported_type';
  if (types.includes('application/pdf') && files.length > 1)
    return 'mixed_input';
  if (files.length > UPLOAD_LIMITS.maxImages) return 'too_many_files';

  const total = files.reduce((sum, file) => sum + file.size, 0);
  return total > UPLOAD_LIMITS.maxBytes ? 'too_large' : null;
}
