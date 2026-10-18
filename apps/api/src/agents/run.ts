import {
  Gemini,
  GOOGLE_SEARCH,
  InMemoryRunner,
  isFinalResponse,
  LlmAgent,
  stringifyContent,
  type Event,
} from '@google/adk';
import { ThinkingLevel, type Part } from '@google/genai';
import type { AnalysisMeta } from '@repo/api-types';
import { z } from 'zod';

import { config } from '../config';
import { recordCall } from '../telemetry';

/**
 * Runs one message through an agent and hands each event to `onEvent`. The
 * call is cancelled once `seconds` have passed: the signal reaches the HTTP
 * request to the model, so the stage stops waiting for it. Google may still
 * charge for the work. Every call is logged with its tokens, also one that
 * was cancelled or failed.
 */
async function converse(
  name: string,
  agent: LlmAgent,
  model: string,
  parts: Part[],
  seconds: number,
  onEvent: (event: Event) => void,
) {
  const runner = new InMemoryRunner({ agent, appName: name });
  const session = await runner.sessionService.createSession({
    appName: name,
    userId: name,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), seconds * 1000);
  const { signal } = controller;
  const started = Date.now();
  let metadata: Event['usageMetadata'];
  let searches = 0;
  const timedOut = () =>
    new Error(`The ${name} did not answer in ${seconds} s and was cancelled.`);
  try {
    for await (const event of runner.runAsync({
      userId: name,
      sessionId: session.id,
      newMessage: { role: 'user', parts },
      abortSignal: signal,
    })) {
      metadata = event.usageMetadata ?? metadata;
      searches += event.groundingMetadata?.webSearchQueries?.length ?? 0;
      onEvent(event);
    }
    // The runner stops quietly when the signal fires between events.
    if (signal.aborted) throw timedOut();
  } catch (err) {
    const cancelled = signal.aborted;
    void recordCall({
      name,
      model,
      started,
      metadata,
      outcome: cancelled ? 'cancelled' : 'failed',
      searches,
    });
    throw cancelled ? timedOut() : err;
  } finally {
    clearTimeout(timer);
    await runner.sessionService
      .deleteSession({ appName: name, userId: name, sessionId: session.id })
      .catch(() => {});
  }
  void recordCall({
    name,
    model,
    started,
    metadata,
    outcome: 'answered',
    searches,
  });
}

type Call<Schema extends z.ZodObject, Accept extends z.ZodType> = {
  name: string;
  model: string;
  instruction: string;
  schema: Schema; // what the model is asked for
  // What the answer must be to be used at all, when that is less than the
  // schema because the caller checks the rest itself.
  accept?: Accept;
  parts: Part[];
  seconds: number; // how long to wait for the answer
  // Unbounded at the model's default, so set where the time must be bounded.
  thinkingLevel?: ThinkingLevel;
};

/**
 * One call to a model that has no tools. What it reads is untrusted
 * (TSD 5.8), so the answer is used only if it parses.
 */
export async function runAgent<
  Schema extends z.ZodObject,
  Accept extends z.ZodType = Schema,
>({
  name,
  model,
  instruction,
  schema,
  accept,
  parts,
  seconds,
  thinkingLevel,
}: Call<Schema, Accept>): Promise<z.infer<Accept>> {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');

  const agent = new LlmAgent({
    name,
    model: new Gemini({ model, apiKey }),
    instruction,
    outputSchema: schema,
    generateContentConfig: {
      temperature: 0,
      maxOutputTokens: 65536,
      ...(thinkingLevel && { thinkingConfig: { thinkingLevel } }),
    },
  });
  let answer = '';
  await converse(name, agent, model, parts, seconds, (event) => {
    if (isFinalResponse(event)) answer = stringifyContent(event);
  });
  // ADK can end with an empty answer and no error (ADR 3).
  if (!answer.trim()) throw new Error(`The ${name} returned an empty answer.`);
  return (accept ?? schema).parse(JSON.parse(answer)) as z.infer<Accept>;
}

/**
 * The work, or an error with `message` once `ms` have passed. The work that
 * lost is not cancelled, only no longer waited for.
 */
export function inTime<T>(work: Promise<T>, ms: number, message: string) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * One call with Google Search and no schema: the two do not work together
 * (ADR 3). Returns the URIs of the pages the answer was grounded on.
 */
export async function runSearch({
  name,
  model,
  instruction,
  text,
  seconds,
}: Pick<
  Call<z.ZodObject, z.ZodType>,
  'name' | 'model' | 'instruction' | 'seconds'
> & {
  text: string;
}): Promise<string[]> {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');

  const agent = new LlmAgent({
    name,
    model: new Gemini({ model, apiKey }),
    instruction,
    tools: [GOOGLE_SEARCH],
    // With more thinking a search took 37 to 115 s instead of 15 to 21 s
    // (spike of 2026-10-14).
    generateContentConfig: {
      temperature: 0,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  let answer = '';
  const uris: string[] = [];
  await converse(name, agent, model, [{ text }], seconds, (event) => {
    for (const chunk of event.groundingMetadata?.groundingChunks ?? []) {
      if (chunk.web?.uri) uris.push(chunk.web.uri);
    }
    if (isFinalResponse(event)) answer = stringifyContent(event);
  });
  // An empty answer is a failure, not a search that found nothing (ADR 3).
  if (!answer.trim()) throw new Error(`The ${name} returned an empty answer.`);
  return uris;
}

// What every agent after the Reader is told about the document.
export type Document = Pick<AnalysisMeta, 'docType' | 'title' | 'userRole'>;
export const about = ({ docType, title, userRole }: Document) => ({
  documentType: docType,
  title,
  userRole,
});

/**
 * A call whose answer is a list. The model is held to the schema of an
 * entry; the answer itself only has to be a list, because the caller's check
 * judges each entry on its own and one that does not fit must not cost the
 * others.
 */
export async function askForList(
  model: string,
  name: string,
  instruction: string,
  list: string,
  entry: z.ZodType,
  message: object,
  seconds: number,
  thinkingLevel?: ThinkingLevel,
): Promise<unknown[]> {
  const answer = await runAgent({
    name,
    model,
    instruction,
    schema: z.object({ [list]: z.array(entry) }),
    accept: z.object({ [list]: z.array(z.unknown()) }),
    parts: [{ text: JSON.stringify(message) }],
    seconds,
    thinkingLevel,
  });
  return answer[list]!;
}
