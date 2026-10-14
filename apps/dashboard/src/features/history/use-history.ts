import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { Analysis } from '@repo/api-types';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/auth-store';

export type HistoryEntry = Analysis & { id: string };

/**
 * The signed-in user's analyses, newest first, kept live (F-HIST-1).
 * Undefined until the listener answers, null when it fails. An analysis
 * that does not fit the schema is left out.
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
        const entries = snapshot.docs.flatMap((document) => {
          const parsed = Analysis.safeParse(document.data());
          if (!parsed.success) console.error(parsed.error);
          return parsed.success ? [{ ...parsed.data, id: document.id }] : [];
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
