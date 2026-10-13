import { expect, test } from 'vitest';
import {
  AnalysisMeta,
  Condition,
  ErrorEnvelope,
  Expectation,
  LegalFinding,
  Rule,
  Trap,
} from './index.js';

const nested: Condition = {
  all: [
    { fact: 'daysSinceStart', op: 'lt', value: 30 },
    {
      any: [
        { not: { fact: 'userPaidOnTime', op: 'eq', value: true } },
        { fact: 'cause', op: 'in', value: ['flood', 'riot'] },
      ],
    },
  ],
};

test('nested conditions survive a round trip', () => {
  expect(Condition.parse(structuredClone(nested))).toEqual(nested);
});

test('unknown operators are rejected', () => {
  const bad = { fact: 'daysSinceStart', op: 'approximately', value: 30 };

  expect(Condition.safeParse(bad).success).toBe(false);
});

test('a rule must point at a clause', () => {
  const rule = {
    id: 'r-1',
    kind: 'exclusion',
    summary: 'No cover in the first 30 days',
    clauseIds: [],
    when: nested,
    effect: { type: 'deny', amount: null, percent: null },
    touches: ['daysSinceStart'],
  };

  expect(Rule.safeParse(rule).success).toBe(false);
  expect(Rule.safeParse({ ...rule, clauseIds: ['c-4'] }).success).toBe(true);
});

test('"in" takes a list and comparisons take a single value', () => {
  const listForComparison = { fact: 'daysSinceStart', op: 'lt', value: ['30'] };
  const scalarForIn = { fact: 'cause', op: 'in', value: 'flood' };

  expect(Condition.safeParse(listForComparison).success).toBe(false);
  expect(Condition.safeParse(scalarForIn).success).toBe(false);
});

test('only an unmodeled rule may have no condition', () => {
  const rule = {
    id: 'r-2',
    kind: 'benefit',
    summary: 'Cover for flood damage',
    clauseIds: ['c-7'],
    when: null,
    effect: null,
    touches: [],
  };

  expect(Rule.safeParse(rule).success).toBe(false);
  expect(Rule.safeParse({ ...rule, kind: 'unmodeled' }).success).toBe(true);
});

test('an error envelope needs both a code and a message', () => {
  const body = { error: { code: 'unauthenticated', message: 'Sign in.' } };

  expect(ErrorEnvelope.parse(body)).toEqual(body);
  expect(
    ErrorEnvelope.safeParse({ error: { message: 'Sign in.' } }).success,
  ).toBe(false);
  expect(ErrorEnvelope.safeParse({ message: 'Sign in.' }).success).toBe(false);
});

test('an expectation is never undetermined', () => {
  const expectation = {
    result: 'fine',
    reason: 'Flood is the headline cover.',
  };

  expect(Expectation.parse(expectation)).toEqual(expectation);
  expect(
    Expectation.safeParse({ ...expectation, result: 'undetermined' }).success,
  ).toBe(false);
});

test('a legal finding needs a citation unless it found nothing', () => {
  const finding = {
    status: 'conflicts',
    reasoning: 'The clause removes a right the Act gives.',
    citations: [
      {
        instrument: 'Insurance Act 1966',
        section: 's 25',
        quote: 'An insurer shall not avoid a policy',
        url: 'https://sso.agc.gov.sg/Act/IA1966',
      },
    ],
    error: null,
  };
  const nothingFound = {
    status: 'no_finding',
    reasoning: '',
    citations: [],
    error: 'lookup_unavailable',
  };

  expect(LegalFinding.parse(finding)).toEqual(finding);
  expect(LegalFinding.safeParse({ ...finding, citations: [] }).success).toBe(
    false,
  );
  expect(LegalFinding.safeParse(nothingFound).success).toBe(true);
});

test('a trap can wait for its title but not for its examples', () => {
  const trap = {
    id: 'trap-r-4',
    ruleId: 'r-4',
    scenarioIds: ['s-1', 's-9'],
    severity: 'high',
    title: null,
    action: null,
  };

  expect(Trap.parse(trap)).toEqual(trap);
  expect(Trap.safeParse({ ...trap, scenarioIds: [] }).success).toBe(false);
});

test('analysis meta survives a round trip before the user picks a role', () => {
  const meta = {
    docType: 'lease',
    title: 'Tenancy agreement',
    parties: [
      { name: 'Acme Property Pte Ltd', role: 'landlord' },
      { name: 'Jane Tan', role: 'tenant' },
    ],
    userRole: null,
    jurisdiction: 'SG',
    lawChecked: true,
    language: 'en',
    pageCount: 12,
    unreadablePages: [7],
  };

  expect(AnalysisMeta.parse(meta)).toEqual(meta);
  expect(AnalysisMeta.safeParse({ ...meta, docType: 'receipt' }).success).toBe(
    false,
  );
});
