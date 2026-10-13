import {
  Gemini,
  InMemoryRunner,
  isFinalResponse,
  LlmAgent,
  stringifyContent,
} from '@google/adk';
import type { Part } from '@google/genai';
import type { z } from 'zod';
import { config } from '../config';

type Call<Schema extends z.ZodObject, Accept extends z.ZodType> = {
  name: string;
  model: string;
  instruction: string;
  schema: Schema; // what the model is asked for
  // What the answer must be to be used at all, when that is less than the
  // schema because the caller checks the rest itself.
  accept?: Accept;
  parts: Part[];
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
}: Call<Schema, Accept>): Promise<z.infer<Accept>> {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');

  const agent = new LlmAgent({
    name,
    model: new Gemini({ model, apiKey }),
    instruction,
    outputSchema: schema,
    generateContentConfig: { temperature: 0, maxOutputTokens: 65536 },
  });
  const runner = new InMemoryRunner({ agent, appName: name });

  let answer = '';
  for await (const event of runner.runEphemeral({
    userId: name,
    newMessage: { role: 'user', parts },
  })) {
    if (isFinalResponse(event)) answer = stringifyContent(event);
  }
  // ADK can end with an empty answer and no error (ADR 3).
  if (!answer.trim()) throw new Error(`The ${name} returned an empty answer.`);
  return (accept ?? schema).parse(JSON.parse(answer)) as z.infer<Accept>;
}
