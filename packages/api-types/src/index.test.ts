import { expect, test } from 'vitest';
import {
  Analysis,
  AnalysisMeta,
  ConfirmAnalysisRequest,
  CreateAnalysisRequest,
  ReaderOutput,
  Condition,
  ErrorEnvelope,
  Expectation,
  LegalFinding,
  Rule,
  RuleDraft,
  Scenario,
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

test('a rule draft has no ID and keeps the rule about conditions', () => {
  const draft = {
    id: 'chosen-by-the-model',
    kind: 'deadline',
    summary: 'Tell the insurer within 14 days',
    clauseIds: ['c-9'],
    when: { fact: 'userGaveNoticeDays', op: 'gt', value: 14 },
    effect: null,
    touches: ['userGaveNoticeDays'],
  };

  expect(RuleDraft.parse(draft)).not.toHaveProperty('id');
  expect(RuleDraft.safeParse({ ...draft, when: null }).success).toBe(false);
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

test('a stake is an amount or nothing, never negative', () => {
  const scenario = {
    id: 's-1',
    story: '',
    strategy: 'baseline',
    frequency: 'common',
    targetRuleIds: [],
    facts: {},
  };

  for (const stake of [0, 1000, null]) {
    expect(Scenario.safeParse({ ...scenario, stake }).success).toBe(true);
  }
  expect(Scenario.safeParse({ ...scenario, stake: -1 }).success).toBe(false);
});

const upload = { analysisId: 'a1b2c3d4e5f6', files: ['0-policy.pdf'] };

test('an upload request needs 1 to 30 files', () => {
  expect(CreateAnalysisRequest.safeParse(upload).success).toBe(true);
  expect(
    CreateAnalysisRequest.safeParse({ ...upload, files: [] }).success,
  ).toBe(false);
  const files = Array.from({ length: 31 }, (_, n) => `${n}-page.jpg`);
  expect(CreateAnalysisRequest.safeParse({ ...upload, files }).success).toBe(
    false,
  );
});

test.each(['../bob/a1/0-x.pdf', 'a/b.pdf', 'a\\b.pdf', '..', ''])(
  'the file name %j cannot leave the upload folder',
  (name) => {
    expect(
      CreateAnalysisRequest.safeParse({ ...upload, files: [name] }).success,
    ).toBe(false);
  },
);

test('an analysis id cannot carry a path', () => {
  expect(
    CreateAnalysisRequest.safeParse({ ...upload, analysisId: 'a1/../../x' })
      .success,
  ).toBe(false);
});

test('a confirmation names a known document type and a role', () => {
  const confirm = {
    docType: 'insurance',
    jurisdiction: 'ID',
    userRole: 'insured',
  };
  expect(ConfirmAnalysisRequest.safeParse(confirm).success).toBe(true);
  expect(
    ConfirmAnalysisRequest.safeParse({ ...confirm, docType: 'receipt' })
      .success,
  ).toBe(false);
  expect(
    ConfirmAnalysisRequest.safeParse({ ...confirm, userRole: '' }).success,
  ).toBe(false);
});

test('the reader may name a document type outside the tuned ones', () => {
  const read = {
    isPolicyOrContract: true,
    docType: 'gym membership',
    title: 'Membership agreement',
    parties: [{ name: 'Fit Co', role: 'provider' }],
    jurisdiction: 'SG',
    language: 'en',
    unreadablePages: [],
    clauses: [
      {
        number: '1',
        heading: null,
        text: 'Fees are due monthly.',
        gloss: null,
        page: 1,
      },
    ],
  };
  expect(ReaderOutput.parse(read).docType).toBe('gym membership');
});

test('an analysis has no details until the document is read', () => {
  const fresh = { ownerUid: 'alice', status: 'reading', meta: null };
  expect(Analysis.parse(fresh).meta).toBeNull();
  expect(Analysis.safeParse({ ...fresh, status: 'thinking' }).success).toBe(
    false,
  );
});

test('an analysis carries its facts and counts once the rules are read', () => {
  const analysis = {
    ownerUid: 'alice',
    status: 'fuzzing',
    meta: null,
    factSchema: [
      {
        key: 'daysSinceStart',
        type: 'number',
        values: null,
        unit: 'days',
        description: 'Days since the policy started',
        neutral: 0,
      },
    ],
    counts: { clauses: 12, rules: 7 },
  };

  expect(Analysis.parse(analysis)).toMatchObject({
    factSchema: [{ key: 'daysSinceStart' }],
    counts: { clauses: 12, rules: 7 },
  });
  // After the read there are clauses but no rules yet.
  expect(
    Analysis.parse({ ...analysis, counts: { clauses: 12 } }).counts,
  ).toEqual({ clauses: 12 });
});
