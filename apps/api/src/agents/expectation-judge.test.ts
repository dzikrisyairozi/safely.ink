import { expect, test, vi } from 'vitest';
import type { AnalysisMeta, Rule, StoredScenario } from '@repo/api-types';
import { config } from '../config';
import type { Pack } from '../packs';
import { judge, judgeInput } from './expectation-judge';

// Only the model is replaced: it answers with whatever text a test gives
// it, and what it was asked is kept.
const model = vi.hoisted(() => ({
  answer: '',
  agent: {} as { model: unknown; instruction: string; tools?: unknown },
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

// Everything the judge must not see says SECRET.
const meta: AnalysisMeta = {
  docType: 'insurance',
  title: 'SECRET title',
  parties: [{ name: 'SECRET party', role: 'SECRET role' }],
  userRole: 'insured',
  jurisdiction: 'ID',
  lawChecked: true,
  language: 'id',
  pageCount: 3,
  unreadablePages: [],
};
const pack: Pack = {
  facts: ['SECRET fact worth looking for'],
  seeds: {
    baseline: ['SECRET seed'],
    overlap: [],
    definition: [],
    procedure: [],
    combination: [],
  },
  hints: ['an illness is paid once the policy is in force'],
};
const rule = (id: string, kind: Rule['kind'], summary: string): Rule => ({
  id,
  kind,
  summary,
  clauseIds: ['SECRET-clause'],
  when:
    kind === 'unmodeled' ? null : { fact: 'SECRETfact', op: 'eq', value: true },
  effect:
    kind === 'unmodeled' ? null : { type: 'deny', amount: null, percent: null },
  touches: ['SECRETfact'],
});
const rules = [
  rule('r-001', 'benefit', 'The insurer pays inpatient costs.'),
  rule('r-002', 'exclusion', 'SECRET exclusion'),
  rule('r-003', 'condition', 'SECRET condition'),
  rule('r-004', 'deadline', 'SECRET deadline'),
  rule('r-005', 'limit', 'SECRET limit'),
  rule('r-006', 'charge', 'SECRET charge'),
  rule('r-007', 'unmodeled', 'SECRET unmodeled'),
];
const scenario: StoredScenario = {
  id: 's-001',
  story: 'Ten days in you are admitted with dengue fever.',
  strategy: 'boundary',
  frequency: 'common',
  targetRuleIds: ['r-002'],
  stake: 5000000,
  facts: { SECRETfact: true },
  outcome: {
    scenarioId: 's-001',
    result: 'bad',
    stake: 5000000,
    loss: 5000000,
    decidingRuleId: 'r-002',
    trace: [{ ruleId: 'r-002', fact: 'SECRETfact', note: 'SECRET note' }],
  },
};

test('the judge is given the kind of document, the role, the hints, the benefits and the stories, and nothing else', () => {
  const input = judgeInput(meta, pack, rules, [scenario]);

  expect(input).toEqual({
    document: 'an insurance policy, country: ID',
    userRole: 'insured',
    hints: pack.hints,
    benefits: ['The insurer pays inpatient costs.'],
    scenarios: [{ id: 's-001', story: scenario.story }],
  });
});

// F-CMP-1. This fails when a field of a rule, a scenario or the document is
// added to what the judge reads.
test('no exclusion, condition, charge, fact, outcome, title or party reaches the judge', () => {
  const read = JSON.stringify(judgeInput(meta, pack, rules, [scenario]));

  expect(read).not.toMatch(/SECRET/);
  expect(read).not.toMatch(/bad|5000000|r-00\d/);
});

test('the model reads the input as it is, has no tool and is the fast one', async () => {
  const input = judgeInput(meta, pack, rules, [scenario]);
  const expectation = { id: 's-001', result: 'fine', reason: 'It is illness.' };
  model.answer = JSON.stringify({ expectations: [expectation] });

  expect(await judge(input, 90)).toEqual([expectation]);

  expect(JSON.parse(model.message)).toEqual(input);
  expect(model.agent.tools).toBeUndefined();
  expect(model.agent.model).toMatchObject({
    options: { model: config.models.flash },
  });
  expect(model.agent.instruction).toMatch(/not instructions|never a source/i);
});
