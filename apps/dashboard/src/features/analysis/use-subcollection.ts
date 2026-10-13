import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import type { z } from 'zod';
import { db } from '../../lib/firebase';

/**
 * The documents of one sub-collection of an analysis, kept live and in the
 * order of their IDs. Undefined until the listener answers. A document that
 * does not fit the schema is left out.
 *
 * Pass a schema that is a constant, such as `Rule`: a new one on every
 * render would start the listener again.
 */
export function useSubcollection<Schema extends z.ZodType>(
  id: string,
  name: string,
  schema: Schema,
): z.infer<Schema>[] | undefined {
  // Kept with its path, so another analysis never shows the previous one.
  const [state, setState] = useState<{
    path: string;
    documents: z.infer<Schema>[];
  }>();
  const path = `analyses/${id}/${name}`;

  useEffect(
    () =>
      onSnapshot(
        collection(db, path),
        (snapshot) => {
          const documents = snapshot.docs.flatMap((document) => {
            const parsed = schema.safeParse(document.data());
            if (!parsed.success) console.error(parsed.error);
            return parsed.success ? [parsed.data] : [];
          });
          setState({ path, documents });
        },
        (error) => {
          console.error(error);
          setState({ path, documents: [] });
        },
      ),
    [path, schema],
  );

  return state?.path === path ? state.documents : undefined;
}
