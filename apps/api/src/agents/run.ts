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

type Call<Schema extends z.ZodObject> = {
  name: string;
  model: string;
  instruction: string;
  schema: Schema;
  parts: Part[];
};

/**
 * One call to a model that has no tools. What it reads is untrusted
 * (TSD 5.8), so the answer is used only if it parses with the schema.
 */
export async function runAgent<Schema extends z.ZodObject>({
  name,
  model,
  instruction,
  schema,
  parts,
}: Call<Schema>): Promise<z.infer<Schema>> {
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
  return schema.parse(JSON.parse(answer));
}
