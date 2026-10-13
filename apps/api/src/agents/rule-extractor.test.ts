import { expect, test, vi } from 'vitest';
import proposedFacts from '../../test/fixtures/rules-facts.json';
import proposedRules from '../../test/fixtures/rules-rules.json';
import { checkFacts } from '../pipeline/rule-check';
import { packFor } from '../packs';
import { proposeFacts, proposeRules, repairRules } from './rule-extractor';

// Only the model is replaced: it answers with whatever text a test gives it.
const model = vi.hoisted(() => ({ answer: '' }));
vi.mock('@google/adk', () => ({
  Gemini: class {},
  LlmAgent: class {},
  InMemoryRunner: class {
    async *runEphemeral() {
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
const [benefit, exclusion] = proposedRules.rules;

test('one malformed rule does not lose the rules around it', async () => {
  const extraKey = {
    ...exclusion,
    when: { fact: 'daysSinceStart', op: 'lt', value: 30, unit: 'days' },
  };
  answers({ rules: [benefit, extraKey, 'see clause 4', exclusion] });

  const rules = await proposeRules([], factSchema, document);

  expect(rules).toEqual([benefit, extraKey, 'see clause 4', exclusion]);
});

test('one malformed fact does not lose the facts around it', async () => {
  const [illness, cost] = proposedFacts.facts;
  answers({ facts: [illness, { ...cost, type: 'money' }, cost] });

  const facts = await proposeFacts([], packFor('insurance'), document);

  expect(checkFacts(facts).map((fact) => fact.key)).toEqual(
    expect.arrayContaining(['claimIsForIllness', 'inpatientCost']),
  );
  expect(facts).toHaveLength(3);
});

test('a repair answer without an ID is left out, the others are kept', async () => {
  answers({ rules: [{ ...exclusion, id: 'r-002' }, benefit, 'nothing'] });

  const repaired = await repairRules([], [], factSchema, document);

  expect(repaired).toEqual([{ id: 'r-002', draft: exclusion }]);
});

test('an answer that is not a list of rules is an error', async () => {
  answers({ rules: 'none' });

  await expect(proposeRules([], factSchema, document)).rejects.toThrow();
});
