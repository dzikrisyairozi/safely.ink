import { ref, uploadBytes } from 'firebase/storage';
import type { AnalysisStatus } from '@repo/api-types';
import { api } from '../../lib/api';
import { auth, storage } from '../../lib/firebase';
import { contentTypeOf } from './validate-files';

// The name is kept for the user's sake; the position prefix carries the order.
// Dots in a row are joined: the API refuses a name that contains "..".
export const storedName = (file: File, position: number) =>
  `${position}-${file.name
    .replace(/[^\w.-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(-80)}`;

/**
 * Uploads the pages straight to Storage under the user's own folder, then
 * asks the API to read them. Resolves when the document has been read.
 */
export async function startAnalysis(files: File[]) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');

  const analysisId = crypto.randomUUID();
  const names = files.map(storedName);

  await Promise.all(
    files.map((file, n) =>
      uploadBytes(
        ref(storage, `uploads/${uid}/${analysisId}/${names[n]}`),
        file,
        { contentType: contentTypeOf(file) ?? undefined },
      ),
    ),
  );

  return api<{ analysisId: string; status: AnalysisStatus }>('/v1/analyses', {
    method: 'POST',
    body: JSON.stringify({ analysisId, files: names }),
  });
}
