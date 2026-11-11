import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from './firebase';
import { log } from './telemetry';

const Envelope = z.object({
  message: z.object({
    data: z.base64().min(1),
    publishTime: z.iso.datetime({ offset: true }),
  }),
});
const Notification = z.object({
  costAmount: z.number(),
  budgetAmount: z.number(),
  costIntervalStart: z.iso.datetime({ offset: true }),
});

export async function isPaused() {
  return (await db.doc('system/budget').get()).data()?.paused === true;
}

/** Malformed notifications are acknowledged because a retry cannot fix them. */
export async function receiveBudget(body: unknown) {
  const envelope = Envelope.safeParse(body);
  let decoded: unknown;
  if (envelope.success) {
    try {
      decoded = JSON.parse(
        Buffer.from(envelope.data.message.data, 'base64').toString('utf8'),
      );
    } catch {
      // The schema check below rejects data that is not JSON.
    }
  }
  const notification = Notification.safeParse(decoded);
  if (!envelope.success || !notification.success) {
    log('WARNING', 'malformed budget notification');
    return;
  }
  const incoming = {
    ...notification.data,
    publishTime: envelope.data.message.publishTime,
  };
  const budget = db.doc('system/budget');
  await db.runTransaction(async (tx) => {
    const stored = (await tx.get(budget)).data();
    if (stored) {
      const interval = Date.parse(incoming.costIntervalStart);
      const previous = Date.parse(stored.costIntervalStart);
      if (interval < previous) return;
      if (
        interval === previous &&
        Date.parse(incoming.publishTime) < Date.parse(stored.publishTime)
      )
        return;
    }
    tx.set(budget, {
      ...incoming,
      paused: incoming.costAmount >= incoming.budgetAmount,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
