import {
  Gemini,
  InMemoryRunner,
  isFinalResponse,
  LlmAgent,
  stringifyContent,
} from '@google/adk';
import type { Part } from '@google/genai';
import type { AnalysisMeta } from '@repo/api-types';
import { z } from 'zod';

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
  seconds: number; // how long to wait for the answer
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

  const finalAnswer = async () => {
    let text = '';
    for await (const event of runner.runEphemeral({
      userId: name,
      newMessage: { role: 'user', parts },
    })) {
      if (isFinalResponse(event)) text = stringifyContent(event);
    }
    return text;
  };
  // A call that hangs must end inside the request, so the stage fails and
  // the analysis is not left waiting (TSD 9). runEphemeral takes no abort
  // signal: the call that lost is not cancelled, only no longer waited for.
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`The ${name} did not answer in ${seconds} s.`)),
      seconds * 1000,
    );
  });
  const answer = await Promise.race([finalAnswer(), timeout]).finally(() =>
    clearTimeout(timer),
  );
  // ADK can end with an empty answer and no error (ADR 3).
  if (!answer.trim()) throw new Error(`The ${name} returned an empty answer.`);
  return (accept ?? schema).parse(JSON.parse(answer)) as z.infer<Accept>;
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
): Promise<unknown[]> {
  const answer = await runAgent({
    name,
    model,
    instruction,
    schema: z.object({ [list]: z.array(entry) }),
    accept: z.object({ [list]: z.array(z.unknown()) }),
    parts: [{ text: JSON.stringify(message) }],
    seconds,
  });
  return answer[list]!;
}
