import { beforeEach, expect, test } from 'vitest';
import { config } from './config';
import { db } from './firebase';
import { nextReset, releaseDailySlot, reserveDailySlot } from './usage';

// Run through `pnpm test`, which starts the Firestore emulator.
const noon = new Date('2026-10-13T12:00:00Z');
const started = async (day = '2026-10-13') =>
  (await db.doc(`users/alice/usage/${day}`).get()).data()?.started;

const alreadyStarted = (count: number) =>
  db.doc('users/alice/usage/2026-10-13').set({ started: count });

beforeEach(() => db.recursiveDelete(db.collection('users')));

test('the tenth analysis of the day passes and the eleventh does not', async () => {
  await alreadyStarted(9);

  expect(await reserveDailySlot('alice', noon)).toBe(true);

  expect(await reserveDailySlot('alice', noon)).toBe(false);
  expect(await started()).toBe(10);
});

// Contending transactions back off on the emulator, hence the long timeout.
test('parallel requests cannot take more than ten slots', async () => {
  await alreadyStarted(8);

  const results = await Promise.all(
    Array.from({ length: 5 }, () => reserveDailySlot('alice', noon)),
  );

  expect(results.filter(Boolean)).toHaveLength(2);
  expect(await started()).toBe(10);
}, 30_000);

test('one user reaching the limit does not block another', async () => {
  await alreadyStarted(10);

  expect(await reserveDailySlot('bob', noon)).toBe(true);
});

test('the limit resets at the next UTC midnight', async () => {
  await alreadyStarted(10);

  expect(nextReset(noon).toISOString()).toBe('2026-10-14T00:00:00.000Z');
  expect(await reserveDailySlot('alice', nextReset(noon))).toBe(true);
});

test('a released slot can be taken again', async () => {
  await alreadyStarted(10);

  await releaseDailySlot('alice', noon);

  expect(await started()).toBe(9);
  expect(await reserveDailySlot('alice', noon)).toBe(true);
});

test('releasing with nothing reserved leaves the count at zero', async () => {
  await releaseDailySlot('alice', noon);

  expect((await started()) ?? 0).toBe(0);
});

test('a slot that was given back still counts as an attempt', async () => {
  await db
    .doc('users/alice/usage/2026-10-13')
    .set({ started: 0, attempts: config.limits.attemptsPerUserPerDay - 1 });

  expect(await reserveDailySlot('alice', noon)).toBe(true);
  await releaseDailySlot('alice', noon);

  expect(await reserveDailySlot('alice', noon)).toBe(false);
  expect(await started()).toBe(0);
});
