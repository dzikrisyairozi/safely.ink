import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config';

// What one model call used, as added to the analysis.
export type Usage = {
  calls: number;
  input: number; // prompt tokens, cached ones included
  cached: number;
  output: number; // answer and thinking tokens
  // Calls that reported no usage: cancelled or failed before an answer.
  // Google may still charge for them, so the token cost is a floor.
  unreported: number;
  // Google Search queries the calls reported, charged per query apart from
  // tokens once the free allowance is used.
  searches: number;
  usd: number; // the token cost
};

type Context = {
  analysisId: string;
  stage: string;
  attemptId?: string;
  // Stores what one call used. Called once per call, also for a call that
  // ends after its stage did.
  save?: (model: string, used: Usage) => Promise<void>;
};
const context = new AsyncLocalStorage<
  Context & { saving: Set<Promise<void>> }
>();

/**
 * Runs `work` with every call and log line in it tied to this stage, then
 * waits for the usage saves begun in it, so none is left pending when the
 * request returns and Cloud Run may stop the instance. A model call still
 * running then saves only if the instance stays up.
 */
export async function inStage<T>(
  stage: Context,
  work: () => Promise<T>,
): Promise<T> {
  const saving = new Set<Promise<void>>();
  try {
    return await context.run({ ...stage, saving }, work);
  } finally {
    while (saving.size > 0) await Promise.all(saving);
  }
}

/**
 * One JSON line on stdout, which Cloud Logging reads as a structured entry,
 * with the stage it belongs to. Never pass document text in `fields`.
 */
export function log(
  severity: 'INFO' | 'WARNING' | 'ERROR',
  message: string,
  fields: Record<string, unknown> = {},
) {
  const store = context.getStore();
  console.log(
    JSON.stringify({
      severity,
      message,
      ...(store && {
        analysisId: store.analysisId,
        stage: store.stage,
        attemptId: store.attemptId,
      }),
      ...fields,
    }),
  );
}

type Price = { input: number; cached: number; output: number };
export type PriceList = Record<
  string,
  // In force from `from`, an ISO date. `over` is the price of a call whose
  // prompt has more than that many tokens.
  (Price & { from: string; over?: Price & { tokens: number } })[]
>;

/** US dollars for the tokens of one call, or 0 for a model without a price. */
export function priceOf(
  model: string,
  tokens: { input: number; cached: number; output: number },
  on: Date,
  prices: PriceList = config.prices.models,
): number {
  const day = on.toISOString().slice(0, 10);
  const entry = (prices[model] ?? [])
    .filter((price) => price.from <= day)
    .at(-1);
  if (!entry) return 0;
  const price =
    entry.over && tokens.input > entry.over.tokens ? entry.over : entry;
  const fresh = tokens.input - tokens.cached;
  return (
    (fresh * price.input +
      tokens.cached * price.cached +
      tokens.output * price.output) /
    1_000_000
  );
}

type Metadata = {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
};

/**
 * Logs one model call and has the stage store it. `metadata` is the usage
 * the model reported, absent when the call never answered. The log line
 * carries the numbers, so a store that fails loses none of them.
 */
export async function recordCall({
  name,
  model,
  started,
  metadata,
  outcome,
  searches = 0,
}: {
  name: string;
  model: string;
  started: number; // ms since the epoch
  metadata?: Metadata;
  outcome: 'answered' | 'cancelled' | 'failed';
  searches?: number; // queries the grounding metadata reported
}) {
  const tokens = {
    input:
      (metadata?.promptTokenCount ?? 0) +
      (metadata?.toolUsePromptTokenCount ?? 0),
    cached: metadata?.cachedContentTokenCount ?? 0,
    output:
      (metadata?.candidatesTokenCount ?? 0) +
      (metadata?.thoughtsTokenCount ?? 0),
  };
  const used: Usage = {
    calls: 1,
    ...tokens,
    unreported: metadata ? 0 : 1,
    searches,
    usd: priceOf(model, tokens, new Date(started)),
  };
  const fields = { call: name, model, ...used, ms: Date.now() - started };
  log(outcome === 'answered' ? 'INFO' : 'WARNING', `model call ${outcome}`, {
    ...fields,
  });

  const store = context.getStore();
  if (!store?.save) return;
  const saving = store
    .save(model, used)
    .catch((err) => {
      log('ERROR', 'model call usage not stored', {
        ...fields,
        error: String(err),
      });
    })
    .finally(() => store.saving.delete(saving));
  store.saving.add(saving);
  await saving;
}
