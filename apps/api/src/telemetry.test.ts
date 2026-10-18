import { afterEach, expect, test, vi } from 'vitest';
import { config } from './config';
import { inStage, priceOf, recordCall, type Usage } from './telemetry';

const day = new Date('2026-10-18T00:00:00Z');
const pro = 'gemini-3.1-pro-preview';
const flash = 'gemini-3.8-flash';

afterEach(() => {
  vi.restoreAllMocks();
});

test('every model in use has a price', () => {
  for (const model of Object.values(config.models)) {
    const [price] =
      config.prices.models[model as keyof typeof config.prices.models];
    expect(
      priceOf(model, { input: 100_000, cached: 0, output: 0 }, day),
    ).toBeCloseTo(price!.input / 10, 10);
  }
});

test.each([
  ['fresh input', { input: 100_000, cached: 0, output: 0 }, 0.2],
  ['cached input', { input: 100_000, cached: 100_000, output: 0 }, 0.02],
  ['output', { input: 0, cached: 0, output: 1e6 }, 12],
  [
    'a prompt over 200,000 tokens at the higher rate',
    { input: 300_000, cached: 100_000, output: 10_000 },
    (200_000 * 4 + 100_000 * 0.4 + 10_000 * 18) / 1e6,
  ],
])('the Pro price of %s', (_, tokens, usd) => {
  expect(priceOf(pro, tokens, day)).toBeCloseTo(usd, 10);
});

test('a price applies from its date', () => {
  const tokens = { input: 1e6, cached: 0, output: 0 };

  expect(priceOf(flash, tokens, new Date('2026-12-31T23:00:00Z'))).toBe(0.75);
  expect(priceOf(flash, tokens, new Date('2027-01-01T00:00:00Z'))).toBe(1.5);
  expect(priceOf('a-model-without-a-price', tokens, day)).toBe(0);
});

test('each call is logged as JSON with its stage and stored by the stage', async () => {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((line) => lines.push(line));
  const saved: [string, Usage][] = [];
  const metadata = {
    promptTokenCount: 1000,
    cachedContentTokenCount: 400,
    candidatesTokenCount: 50,
    thoughtsTokenCount: 150,
  };

  await inStage(
    {
      analysisId: 'analysis-1',
      stage: 'comparing',
      save: async (model, used) => {
        saved.push([model, used]);
      },
    },
    async () => {
      const started = Date.now();
      await recordCall({
        name: 'law_search',
        model: flash,
        started,
        metadata,
        outcome: 'answered',
        searches: 2,
      });
      await recordCall({
        name: 'b',
        model: flash,
        started,
        outcome: 'cancelled',
      });
    },
  );

  expect(saved).toEqual([
    [
      flash,
      {
        calls: 1,
        input: 1000,
        cached: 400,
        output: 200,
        unreported: 0,
        searches: 2,
        usd: (600 * 0.75 + 400 * 0.075 + 200 * 3.75) / 1e6,
      },
    ],
    [
      flash,
      {
        calls: 1,
        input: 0,
        cached: 0,
        output: 0,
        unreported: 1,
        searches: 0,
        usd: 0,
      },
    ],
  ]);
  expect(lines.map((line) => JSON.parse(line))).toMatchObject([
    {
      severity: 'INFO',
      message: 'model call answered',
      analysisId: 'analysis-1',
      stage: 'comparing',
      call: 'law_search',
      model: flash,
      input: 1000,
    },
    { severity: 'WARNING', message: 'model call cancelled', call: 'b' },
  ]);
});

test('a call that ends after its stage is still stored', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const saved: string[] = [];
  let finish!: () => void;
  const late = new Promise<void>((resolve) => (finish = resolve));

  const stillRunning = await inStage(
    {
      analysisId: 'analysis-1',
      stage: 'reading',
      save: async (model) => {
        saved.push(model);
      },
    },
    async () => {
      const call = late.then(() =>
        recordCall({
          name: 'reader',
          model: pro,
          started: 0,
          outcome: 'answered',
        }),
      );
      return { call };
    },
  );
  finish();
  await stillRunning.call;

  expect(saved).toEqual([pro]);
});

test('a store that fails is logged with the numbers, and the call goes on', async () => {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((line) => lines.push(line));

  await inStage(
    {
      analysisId: 'analysis-1',
      stage: 'fuzzing',
      save: async () => {
        throw new Error('unavailable');
      },
    },
    () =>
      recordCall({ name: 'a', model: flash, started: 0, outcome: 'failed' }),
  );

  expect(JSON.parse(lines.at(-1)!)).toMatchObject({
    severity: 'ERROR',
    message: 'model call usage not stored',
    call: 'a',
    unreported: 1,
    error: 'Error: unavailable',
  });
});

test('outside a stage a call is only logged', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  await recordCall({ name: 'a', model: flash, started: 0, outcome: 'failed' });

  expect(log).toHaveBeenCalledTimes(1);
});

test('a stage waits for the usage saves begun in it', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  let stored = false;

  await inStage(
    {
      analysisId: 'analysis-1',
      stage: 'fuzzing',
      save: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        stored = true;
      },
    },
    async () => {
      void recordCall({
        name: 'a',
        model: flash,
        started: 0,
        outcome: 'answered',
      });
    },
  );

  expect(stored).toBe(true);
});
