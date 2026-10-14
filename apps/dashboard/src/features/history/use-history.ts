import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import type { z } from 'zod';
import { Analysis, AnalysisMeta, AnalysisStatus } from '@repo/api-types';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/auth-store';

// Only what a row shows, so an analysis stored before a field of the whole
// document was required is still listed, and can be deleted (F-HIST-2).
const HistoryFields = Analysis.pick({
  grade: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: AnalysisStatus.optional(),
  meta: AnalysisMeta.pick({
    title: true,
    docType: true,
    jurisdiction: true,
  }).nullable(),
});
export type HistoryEntry = z.infer<typeof HistoryFields> & { id: string };

/**
 * The signed-in user's analyses, newest first, kept live (F-HIST-1).
 * Undefined until the listener answers, null when it fails. An analysis
 * that does not fit even the fields of a row is listed untitled.
 */
export function useHistory(): HistoryEntry[] | null | undefined {
  const uid = useAuthStore((state) => state.user?.uid);
  // Kept with its user, so another account never shows the previous list.
  const [state, setState] = useState<{
    uid: string;
    entries: HistoryEntry[] | null;
  }>();

  useEffect(() => {
    if (!uid) return;
    // The rules let a user list analyses only by their own ownerUid.
    const history = query(
      collection(db, 'analyses'),
      where('ownerUid', '==', uid),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      history,
      (snapshot) => {
        const entries = snapshot.docs.map((document): HistoryEntry => {
          const parsed = HistoryFields.safeParse(document.data());
          if (parsed.success) return { ...parsed.data, id: document.id };
          console.error(parsed.error);
          return { id: document.id, meta: null };
        });
        setState({ uid, entries });
      },
      (error) => {
        console.error(error);
        setState({ uid, entries: null });
      },
    );
  }, [uid]);

  return state && state.uid === uid ? state.entries : undefined;
}
