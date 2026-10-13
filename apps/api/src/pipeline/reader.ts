import type { ReaderOutput } from '@repo/api-types';
import type { Upload } from '../uploads';

/** Reads the document into details and clauses. The result is unchecked. */
export async function readDocument(
  _files: Upload[],
  _pageCount: number,
): Promise<ReaderOutput> {
  throw new Error('The Reader is not connected to a model yet.');
}
