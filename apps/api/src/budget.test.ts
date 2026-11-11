import { beforeEach, expect, test, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { isPaused, receiveBudget } from './budget';
import { db } from './firebase';

// Firestore transactions run against the emulator, like the usage tests.
const budget = db.doc('system/budget');
const interval = '2026-11-01T00:00:00Z';
const publishTime = '2026-11-02T00:00:00Z';
const laterPublishTime = '2026-11-02T01:00:00Z';
const notify = (
  costAmount: number,
  costIntervalStart = interval,
  budgetAmount = 100,
  published = publishTime,
) =>
  receiveBudget({
    message: {
      publishTime: published,
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
      publishTime,
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
    await notify(cost, '2026-10-01T00:00:00Z', 100, laterPublishTime);

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

test.each([50, 150])(
  'an earlier publish time with cost %s cannot replace a pause',
  async (cost) => {
    await notify(100, interval, 100, laterPublishTime);
    const before = await stored();
    await notify(cost);

    expect(await stored()).toEqual(before);
    expect(await isPaused()).toBe(true);
  },
);

test('an earlier publish time within the same millisecond cannot clear a pause', async () => {
  await notify(100, interval, 100, '2026-11-02T00:00:00.123900Z');
  const before = await stored();
  await notify(80, interval, 100, '2026-11-02T00:00:00.123100Z');

  expect(await stored()).toEqual(before);
  expect(await isPaused()).toBe(true);
});

test('an older message with the same cost cannot clear a lower-budget pause', async () => {
  await notify(90);
  await notify(90, interval, 80, laterPublishTime);
  expect(await isPaused()).toBe(true);
  const paused = await stored();
  await notify(90);

  expect(await stored()).toEqual(paused);
  expect(await isPaused()).toBe(true);
});

test('a later lower-cost correction with a raised budget clears the pause', async () => {
  await notify(120);
  expect(await isPaused()).toBe(true);
  await notify(110, interval, 150, laterPublishTime);

  expect(await stored()).toMatchObject({
    costAmount: 110,
    budgetAmount: 150,
    publishTime: laterPublishTime,
    paused: false,
  });
  expect(await isPaused()).toBe(false);
});

test('a redelivery with the same publish time keeps the budget values', async () => {
  await notify(100);
  const before = await stored();
  await notify(100);

  expect(await stored()).toEqual({
    ...before,
    updatedAt: expect.any(Timestamp),
  });
  expect(await isPaused()).toBe(true);
});

test('a lower cost with an equal publish time applies', async () => {
  await notify(100);
  await notify(80);

  expect(await stored()).toMatchObject({ costAmount: 80, paused: false });
});

test('an increasing cost within the interval pauses work', async () => {
  await notify(90);
  await notify(100, interval, 100, laterPublishTime);

  expect(await isPaused()).toBe(true);
});

test.each([10, 110])(
  'a later interval resets the pause using cost %s',
  async (cost) => {
    await notify(150, interval, 100, laterPublishTime);
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
  await notify(100, interval, 100, laterPublishTime);
  await notify(20, '2026-11-01T01:00:00+01:00');
  expect(await isPaused()).toBe(true);
  await notify(10, '2026-11-01T00:30:00-01:00');
  expect(await isPaused()).toBe(false);
});

test.each([
  ['2026-11-02T01:30:00+01:00', true],
  ['2026-11-02T02:00:00+01:00', false],
  ['2026-11-02T00:30:00-01:00', false],
])('publish time %s compares as an instant', async (published, paused) => {
  await notify(100, interval, 100, laterPublishTime);
  await notify(80, interval, 100, published);

  expect(await isPaused()).toBe(paused);
});

test('concurrent messages retain the latest publish time even with a lower cost', async () => {
  await Promise.all([
    notify(80),
    notify(120, interval, 100, '2026-11-02T00:30:00Z'),
    notify(95, interval, 100, laterPublishTime),
  ]);

  expect(await stored()).toMatchObject({
    costAmount: 95,
    publishTime: laterPublishTime,
    paused: false,
  });
}, 30_000);

test.each([
  {},
  {
    message: {
      data: Buffer.from(
        JSON.stringify({
          costAmount: 90,
          budgetAmount: 100,
          costIntervalStart: interval,
        }),
      ).toString('base64'),
    },
  },
])(
  'a malformed notification leaves an existing pause unchanged: %j',
  async (body) => {
    await notify(100);
    const before = await stored();
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    await receiveBudget(body);

    expect(await stored()).toEqual(before);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('malformed budget notification'),
    );
    logged.mockRestore();
  },
);
