import { beforeEach, expect, test, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { isPaused, receiveBudget } from './budget';
import { db } from './firebase';

// Firestore transactions run against the emulator, like the usage tests.
const budget = db.doc('system/budget');
const interval = '2026-11-01T00:00:00Z';
const notify = (
  costAmount: number,
  costIntervalStart = interval,
  budgetAmount = 100,
) =>
  receiveBudget({
    message: {
      data: Buffer.from(
        JSON.stringify({
          costAmount,
          budgetAmount,
          costIntervalStart,
        }),
      ).toString('base64'),
    },
  });
const stored = async () => (await budget.get()).data();

beforeEach(() => budget.delete());

test('a missing budget does not pause work', async () => {
  expect(await isPaused()).toBe(false);
});

test.each([99, 100, 101])(
  'spending %s pauses only at or above the budget',
  async (cost) => {
    await notify(cost);

    expect(await isPaused()).toBe(cost >= 100);
    expect(await stored()).toEqual({
      costAmount: cost,
      budgetAmount: 100,
      costIntervalStart: interval,
      paused: cost >= 100,
      updatedAt: expect.any(Timestamp),
    });
  },
);

test.each([50, 150])(
  'an older interval with cost %s cannot change the budget',
  async (cost) => {
    await notify(100);
    const before = await stored();
    await notify(cost, '2026-10-01T00:00:00Z');

    expect(await stored()).toEqual(before);
    expect(await isPaused()).toBe(true);
  },
);

test('an older interval cannot pause a later interval below its budget', async () => {
  await notify(10);
  const before = await stored();
  await notify(150, '2026-10-01T00:00:00Z');

  expect(await stored()).toEqual(before);
  expect(await isPaused()).toBe(false);
});

test.each([50, 100])(
  'a repeated interval with cost %s cannot unpause work',
  async (cost) => {
    await notify(100);
    await notify(cost);

    expect(await isPaused()).toBe(true);
    expect((await stored())?.costAmount).toBe(100);
  },
);

test('a lower cost within the interval does not replace the stored amount', async () => {
  await notify(90);
  const before = await stored();
  await notify(80);

  expect(await stored()).toEqual(before);
});

test('an increasing cost within the interval pauses work', async () => {
  await notify(90);
  await notify(100);

  expect(await isPaused()).toBe(true);
});

test.each([10, 110])(
  'a later interval resets the pause using cost %s',
  async (cost) => {
    await notify(150);
    await notify(cost, '2026-12-01T00:00:00Z', 110);

    expect(await stored()).toMatchObject({
      costAmount: cost,
      budgetAmount: 110,
      costIntervalStart: '2026-12-01T00:00:00Z',
      paused: cost >= 110,
    });
  },
);

test('intervals compare as instants even with different offsets', async () => {
  await notify(100);
  await notify(20, '2026-11-01T01:00:00+01:00');
  expect(await isPaused()).toBe(true);
  await notify(10, '2026-11-01T00:30:00-01:00');
  expect(await isPaused()).toBe(false);
});

test('concurrent messages cannot replace a higher cost with a lower one', async () => {
  await Promise.all([notify(80), notify(120), notify(95)]);

  expect(await stored()).toMatchObject({ costAmount: 120, paused: true });
}, 30_000);

test('a malformed notification leaves an existing pause unchanged', async () => {
  await notify(100);
  const before = await stored();
  const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
  await receiveBudget({});

  expect(await stored()).toEqual(before);
  expect(logged).toHaveBeenCalledWith(
    expect.stringContaining('malformed budget notification'),
  );
  logged.mockRestore();
});
