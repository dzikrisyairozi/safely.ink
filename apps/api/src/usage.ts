import { config } from './config';
import { db } from './firebase';

// The day is the UTC day, so the limit resets at the same moment for everyone.
const today = (uid: string, now: Date) =>
  db.doc(`users/${uid}/usage/${now.toISOString().slice(0, 10)}`);

export const nextReset = (now: Date) =>
  new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );

/**
 * Takes one of the day's analyses for this user; false when none is left.
 * Reserved before the Reader runs so parallel uploads cannot all pass.
 */
export function reserveDailySlot(uid: string, now: Date) {
  const ref = today(uid, now);
  return db.runTransaction(async (tx) => {
    const started: number = (await tx.get(ref)).data()?.started ?? 0;
    if (started >= config.limits.analysesPerUserPerDay) return false;
    tx.set(ref, { started: started + 1 });
    return true;
  });
}

/** Gives a slot back. Pass the `now` it was reserved with. */
export function releaseDailySlot(uid: string, now: Date) {
  const ref = today(uid, now);
  return db.runTransaction(async (tx) => {
    const started: number = (await tx.get(ref)).data()?.started ?? 0;
    if (started > 0) tx.set(ref, { started: started - 1 });
  });
}
