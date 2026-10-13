import { expect, test } from 'vitest';
import type { Clause, Fact } from '@repo/api-types';
import proposedFacts from '../../test/fixtures/rules-facts.json';
import proposedRules from '../../test/fixtures/rules-rules.json';
import {
  BASE_FACTS,
  MAX_FACTS,
  checkFacts,
  checkRules,
  demote,
  numbered,
} from './rule-check';

// The fixtures are RuleExtractor output as the model returns it.
const facts = proposedFacts.facts as Fact[];
const factSchema = checkFacts(facts);
const clauses = ['c-001', 'c-002', 'c-003'].map((id, n): Clause => ({
  id,
  number: null,
  heading: null,
  text: 'Wording of the clause.',
  gloss: null,
  page: n + 1,
}));
const [benefit, exclusion] = proposedRules.rules;

const check = (drafts: unknown[]) =>
  checkRules(numbered(drafts), clauses, factSchema);

test('the base facts come first, also when the model returns none', () => {
  expect(checkFacts([])).toEqual(BASE_FACTS);
  expect(factSchema.map((fact) => fact.key)).toEqual([
    ...BASE_FACTS.map((fact) => fact.key),
    'claimIsForIllness',
    'inpatientCost',
    'treatmentPlace',
  ]);
});

test('a model fact cannot redefine a base fact', () => {
  const redefined = { ...facts[0]!, key: 'daysSinceStart', neutral: true };

  expect(checkFacts([redefined])).toEqual(BASE_FACTS);
});

test('a fact that does not fit its own definition is dropped', () => {
  const enumWithoutValues = { ...facts[2]!, values: [] };
  const wrongNeutral = { ...facts[1]!, neutral: 'none' };
  const twice = [facts[0]!, { ...facts[0]!, description: 'Again' }];

  const kept = checkFacts([enumWithoutValues, wrongNeutral, ...twice]);

  expect(kept.slice(BASE_FACTS.length)).toEqual([facts[0]]);
});

test('rules that fit get an ID in the order they came', () => {
  const { valid, invalid } = check(proposedRules.rules);

  expect(valid.map((rule) => [rule.id, rule.kind])).toEqual([
    ['r-001', 'benefit'],
    ['r-002', 'exclusion'],
    ['r-003', 'unmodeled'],
  ]);
  expect(invalid).toEqual([]);
});

test('a rule that cites no existing clause is discarded', () => {
  const orphan = { ...exclusion, clauseIds: ['c-999'] };

  const { valid, invalid } = check([benefit, orphan]);

  expect(valid.map((rule) => rule.id)).toEqual(['r-001']);
  expect(invalid).toEqual([]);
});

test('a rule keeps its real clause and loses the unknown one', () => {
  const { valid } = check([{ ...exclusion, clauseIds: ['c-999', 'c-002'] }]);

  expect(valid[0]!.clauseIds).toEqual(['c-002']);
});

test.each([
  {
    name: 'a fact that is not in the schema',
    draft: {
      ...exclusion,
      when: { fact: 'preExisting', op: 'eq', value: true },
    },
    issue: /preExisting/,
  },
  {
    name: 'a value of the wrong type',
    draft: {
      ...exclusion,
      when: { fact: 'daysSinceStart', op: 'lt', value: 'thirty' },
    },
    issue: /daysSinceStart/,
  },
  {
    name: 'a typed rule without a condition',
    draft: { ...exclusion, when: null },
    issue: /unmodeled/,
  },
  { name: 'an entry that is not a rule', draft: 'see clause 4', issue: /./ },
])('$name is sent back with the reason', ({ draft, issue }) => {
  const { valid, invalid } = check([benefit, draft]);

  expect(valid.map((rule) => rule.id)).toEqual(['r-001']);
  expect(invalid).toEqual([
    { id: 'r-002', draft, issues: [expect.stringMatching(issue)] },
  ]);
});

test('a rule that cannot be repaired is kept as unmodeled', () => {
  const draft = {
    ...exclusion,
    when: { fact: 'preExisting', op: 'eq', value: true },
    touches: ['preExisting', 'daysSinceStart'],
  };

  expect(demote({ id: 'r-002', draft }, clauses, factSchema)).toEqual({
    id: 'r-002',
    kind: 'unmodeled',
    summary: exclusion!.summary,
    clauseIds: ['c-002'],
    when: null,
    effect: null,
    touches: ['daysSinceStart'],
  });
});

test('a demoted rule may be left with no fact', () => {
  const draft = { ...exclusion, touches: ['preExisting'] };

  expect(demote({ id: 'r-002', draft }, clauses, factSchema)?.touches).toEqual(
    [],
  );
});

test('nothing is kept of an entry with no summary or no real clause', () => {
  const orphan = { ...exclusion, clauseIds: ['c-999'] };

  expect(demote({ id: 'r-1', draft: 'text' }, clauses, factSchema)).toBeNull();
  expect(demote({ id: 'r-2', draft: orphan }, clauses, factSchema)).toBeNull();
});

test('a fact whose key is not a plain camelCase name is dropped', () => {
  const named = (key: string) => ({ ...facts[0]!, key });

  const kept = checkFacts(
    ['refund.days', '__proto__', 'Refund', 'refund days', 'refundDays2'].map(
      named,
    ),
  );

  expect(kept.slice(BASE_FACTS.length).map((fact) => fact.key)).toEqual([
    'refundDays2',
  ]);
});

test('no more facts are kept than the model was asked for', () => {
  const many = Array.from({ length: MAX_FACTS + 5 }, (_, n) => ({
    ...facts[0]!,
    key: `fact${n}`,
  }));

  const kept = checkFacts(many).slice(BASE_FACTS.length);

  expect(kept).toHaveLength(MAX_FACTS);
  expect(kept.at(-1)!.key).toBe(`fact${MAX_FACTS - 1}`);
});
