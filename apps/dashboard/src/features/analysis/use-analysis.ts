import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Analysis } from '@repo/api-types';
import { db } from '../../lib/firebase';

/**
 * The analysis document, kept live by a Firestore listener. `null` means it
 * does not exist or belongs to someone else; the rules answer both the same.
 */
export function useAnalysis(id: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const key = ['analysis', id];
    return onSnapshot(
      doc(db, 'analyses', id),
      (snapshot) => {
        const analysis = Analysis.safeParse(snapshot.data());
        queryClient.setQueryData(key, analysis.success ? analysis.data : null);
      },
      () => queryClient.setQueryData(key, null),
    );
  }, [id, queryClient]);

  return useQuery<Analysis | null>({
    queryKey: ['analysis', id],
    // The listener is the only source; this never settles on its own.
    queryFn: () => new Promise(() => {}),
    staleTime: Infinity,
  });
}
