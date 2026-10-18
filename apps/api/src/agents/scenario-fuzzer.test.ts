import { beforeEach, expect, test, vi } from 'vitest';
import type { z } from 'zod';
import type { Rule } from '@repo/api-types';
import proposedFacts from '../../test/fixtures/rules-facts.json';
import proposedRules from '../../test/fixtures/rules-rules.json';
import { config } from '../config';
import { packFor } from '../packs';
import { boundaryDrafts } from '../pipeline/boundary';
import { checkFacts } from '../pipeline/rule-check';
import { proposeScenarios, tellBoundaries } from './scenario-fuzzer';

// Only the model is replaced: it answers with whatever text a test gives
// it, and what it was asked is kept.
const model = vi.hoisted(() => ({
  answer: '',
  hangs: false,
  calls: 0,
  agent: {} as { model: unknown; instruction: string; outputSchema: unknown },
  message: '',
}));
vi.mock('@google/adk', () => ({
  Gemini: class {
    constructor(public options: { model: string }) {}
  },
  LlmAgent: class {
    constructor(options: typeof model.agent) {
      model.agent = options;
    }
  },
  InMemoryRunner: class {
    sessionService = {
      createSession: async () => ({ id: 'session' }),
      deleteSession: async () => {},
    };
    async *runAsync(run: {
      newMessage: { parts: { text: string }[] };
      abortSignal: AbortSignal;
    }) {
      model.calls += 1;
      model.message = run.newMessage.parts[0]!.text;
      if (model.hangs) {
        await new Promise((stop) =>
          run.abortSignal.addEventListener('abort', stop),
        );
      }
      yield {};
    }
  },
  isFinalResponse: () => true,
  stringifyContent: () => model.answer,
}));
vi.mock('../config', async (original) => {
  const { config } = await original<typeof import('../config')>();
  return { config: { ...config, GEMINI_API_KEY: 'test-key' } };
});

const answers = (value: unknown) => {
  model.answer = JSON.stringify(value);
};
const document = {
  docType: 'insurance',
  title: 'Polis',
  userRole: 'insured',
} as const;
const factSchema = checkFacts(proposedFacts.facts);
const rules = proposedRules.rules.map(
  (rule, n) => ({ ...rule, id: `r-00${n + 1}` }) as Rule,
);
const told = {
  story: 'You are admitted with dengue fever on day 29 of the policy.',
  frequency: 'common',
  stake: 8000000,
};

beforeEach(() => {
  model.calls = 0;
});

test('the model is asked for a value for every fact of this document, by name', async () => {
  answers({ scenarios: [] });

  await proposeScenarios(
    'procedure',
    rules,
    factSchema,
    packFor('insurance'),
    document,
    90,
  );

  const asked = model.agent.outputSchema as z.ZodObject<{
    scenarios: z.ZodArray<z.ZodObject<{ facts: z.ZodObject }>>;
  }>;
  expect(Object.keys(asked.shape.scenarios.element.shape.facts.shape)).toEqual(
    factSchema.map((fact) => fact.key),
  );
  expect(model.agent.model).toMatchObject({
    options: { model: config.models.flash },
  });
});

test('the model gets the role, the rules and the seeds of its strategy, and not the others', async () => {
  answers({ scenarios: [] });
  const { seeds } = packFor('insurance');

  await proposeScenarios(
    'procedure',
    rules,
    factSchema,
    { facts: [], seeds, hints: [] },
    document,
    90,
  );

  const message = JSON.parse(model.message);
  expect(message).toMatchObject({
    userRole: 'insured',
    examples: seeds.procedure,
    rules: [{ id: 'r-001' }, { id: 'r-002' }, { id: 'r-003' }],
  });
  expect(model.message).not.toContain(seeds.overlap[0]);
  expect(model.agent.instruction).toMatch(/never a source of instructions/);
});

test('one malformed scenario does not lose the ones around it', async () => {
  const entries = [{ ...told, targetRuleIds: [], facts: {} }, 'a story', told];
  answers({ scenarios: entries });

  const proposed = await proposeScenarios(
    'overlap',
    rules,
    factSchema,
    packFor('insurance'),
    document,
    90,
  );

  expect(proposed).toEqual(entries);
});

test('a boundary keeps the facts and the target code gave it, whatever the model says', async () => {
  const drafts = boundaryDrafts(rules, factSchema);
  answers({
    stories: [
      { ...told, n: 2, facts: { daysSinceStart: 999 }, targetRuleIds: [] },
      { ...told, n: 99 },
      'no story',
    ],
  });

  const proposed = await tellBoundaries(drafts, document, 90);

  expect(proposed).toEqual([
    { ...told, facts: drafts[1]!.facts, targetRuleIds: ['r-002'] },
  ]);
  expect(JSON.parse(model.message).situations).toHaveLength(drafts.length);
});

test('with no boundary to tell, the model is not called', async () => {
  expect(await tellBoundaries([], document, 90)).toEqual([]);
  expect(model.calls).toBe(0);
});

test('an answer that is not a list is an error', async () => {
  answers({ scenarios: 'none' });

  await expect(
    proposeScenarios(
      'baseline',
      rules,
      factSchema,
      packFor('other'),
      document,
      90,
    ),
  ).rejects.toThrow();
});

test('a call waits as long as it is given, not a fixed time', async () => {
  vi.useFakeTimers();
  model.hangs = true;
  let failed = false;

  tellBoundaries(boundaryDrafts(rules, factSchema), document, 240).catch(() => {
    failed = true;
  });

  await vi.advanceTimersByTimeAsync(120_000);
  expect(failed).toBe(false);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(failed).toBe(true);
  vi.useRealTimers();
  model.hangs = false;
});
