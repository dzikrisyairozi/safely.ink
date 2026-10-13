import { expect, test, vi } from 'vitest';
import type { Rule, StoredScenario, Trap } from '@repo/api-types';
import { config } from '../config';
import { neutral, trapBriefs, worded, writeTraps } from './trap-writer';

// Only the model is replaced.
const model = vi.hoisted(() => ({
  answer: '',
  agent: {} as { model: unknown; tools?: unknown },
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
    async *runEphemeral(run: { newMessage: { parts: { text: string }[] } }) {
      model.message = run.newMessage.parts[0]!.text;
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

const trap: Trap = {
  id: 'trap-r-002',
  ruleId: 'r-002',
  scenarioIds: ['s-001', 's-002', 's-003'],
  severity: 'high',
  title: null,
  action: null,
};
const words = {
  id: 'trap-r-002',
  title: 'An illness in the first 30 days is not paid',
  action: 'Does the waiting period also apply to an emergency?',
};

test.each([
  'This clause is a scam',
  'The insurer tricks you out of your claim',
  'An ILLEGAL waiting period',
  'They deceive you about the limit',
  'A fraudulent exclusion',
])('"%s" accuses the other party', (text) => {
  expect(neutral(text)).toBe(false);
});

test('a plain description of what the document does is neutral', () => {
  expect(neutral(words.title)).toBe(true);
  expect(neutral(words.action)).toBe(true);
});

test('a trap gets the title and the questions written for it', () => {
  expect(worded([trap], [words])).toEqual([
    { ...trap, title: words.title, action: words.action },
  ]);
});

test('a text that accuses is left out, and the other one stays', () => {
  const [told] = worded([trap], [{ ...words, title: 'A scam on day 29' }]);

  expect(told).toEqual({ ...trap, title: null, action: words.action });
});

test.each([
  ['for another trap', { ...words, id: 'trap-r-009' }],
  ['without a title', { id: 'trap-r-002', action: words.action }],
  [
    'that tries to set the severity only',
    { id: 'trap-r-002', severity: 'low' },
  ],
  ['that is not an object', 'trap-r-002'],
])('an answer %s changes nothing', (_, answer) => {
  expect(worded([trap], [answer])).toEqual([trap]);
});

test('only the words come from the answer, never the numbers', () => {
  const answer = {
    ...words,
    severity: 'low',
    ruleId: 'r-001',
    scenarioIds: [],
  };

  expect(worded([trap], [answer])[0]).toMatchObject({
    severity: 'high',
    ruleId: 'r-002',
    scenarioIds: trap.scenarioIds,
  });
});

const rule = {
  id: 'r-002',
  kind: 'exclusion',
  summary: 'An illness in the first 30 days is not paid.',
} as Rule;
const scenario = (id: string) =>
  ({
    id,
    story: `Story of ${id}.`,
    expectation: { result: 'fine', reason: 'It is an illness.' },
    outcome: { result: 'bad', stake: 5_000_000, loss: 5_000_000 },
  }) as StoredScenario;

test('the model is told the rule and the first two examples of a trap', () => {
  const scenarios = ['s-000', 's-001', 's-002', 's-003'].map(scenario);

  expect(trapBriefs([trap], [rule], scenarios)).toEqual([
    {
      id: 'trap-r-002',
      severity: 'high',
      rule: { kind: 'exclusion', summary: rule.summary },
      examples: ['s-001', 's-002'].map((id) => ({
        story: `Story of ${id}.`,
        expected: 'fine',
        because: 'It is an illness.',
        result: 'bad',
        stake: 5_000_000,
        loss: 5_000_000,
      })),
    },
  ]);
});

test('the model has no tool, is the fast one and is told to stay neutral', async () => {
  model.answer = JSON.stringify({ traps: [words] });
  const briefs = trapBriefs([trap], [rule], [scenario('s-001')]);
  const document = {
    docType: 'insurance',
    title: 'Polis',
    userRole: 'insured',
  };

  expect(await writeTraps(briefs, document as never, 60)).toEqual([words]);

  expect(JSON.parse(model.message)).toMatchObject({
    userRole: 'insured',
    findings: briefs,
  });
  expect(model.agent.tools).toBeUndefined();
  expect(model.agent.model).toMatchObject({
    options: { model: config.models.flash },
  });
});
