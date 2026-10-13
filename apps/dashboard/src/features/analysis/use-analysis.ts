import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Analysis } from '@repo/api-types';
import { db } from '../../lib/firebase';

type Result = { analysis: Analysis | null; failed: boolean };

/**
 * The analysis document, kept live by a Firestore listener. `analysis` is
 * undefined until the listener answers and `null` when the document does not
 * exist or belongs to someone else; the rules answer both the same. `failed`
 * means the document could not be read at all, which is not "not found".
 */
export function useAnalysis(id: string) {
  // Kept with its ID, so another analysis never shows the previous one.
  const [state, setState] = useState<Result & { id: string }>();

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'analyses', id),
        (snapshot) => {
          const data = snapshot.data();
          const parsed = Analysis.safeParse(data);
          const failed = data !== undefined && !parsed.success;
          if (failed) console.error(parsed.error);
          setState({ id, analysis: parsed.data ?? null, failed });
        },
        (error) => {
          const failed = error.code !== 'permission-denied';
          if (failed) console.error(error);
          setState({ id, analysis: null, failed });
        },
      ),
    [id],
  );

  return state?.id === id
    ? { analysis: state.analysis, failed: state.failed }
    : { analysis: undefined, failed: false };
}
