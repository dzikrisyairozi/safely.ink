import { beforeEach, expect, test, vi } from 'vitest';
import type {
  AnalysisMeta,
  LegalFinding,
  Outcome,
  Rule,
} from '@repo/api-types';
import { assessLaw } from '../agents/legal-researcher';
import { config } from '../config';
import { readPage } from './fetch';
import { lookUpLaw } from './research';
import { findSources } from './search';

vi.mock('../agents/legal-researcher');
vi.mock('./fetch');
vi.mock('./search');
const sources = vi.mocked(findSources);
const read = vi.mocked(readPage);
const assess = vi.mocked(assessLaw);

const meta = {
  docType: 'insurance',
  jurisdiction: 'SG',
  lawChecked: true,
  userRole: 'insured',
} as AnalysisMeta;
const rule = (id: string) => ({ id, summary: `Rule ${id}.` }) as Rule;
const rules = ['r-001', 'r-002', 'r-003', 'r-004', 'r-005', 'r-006'].map(rule);
const outcome = (
  scenarioId: string,
  result: Outcome['result'],
  decidingRuleId: string | null,
): Outcome => ({
  scenarioId,
  result,
  stake: 100,
  loss: result === 'fine' ? 0 : 100,
  decidingRuleId,
  trace: [],
});

const page = 'https://sso.agc.gov.sg/Act/IA1966';
const quote = 'A Singapore insurer must not use a form of proposal';
const text = `Section 23. ${quote} which does not have a warning.`;
const citation = {
  instrument: 'Insurance Act 1966',
  section: 's 23',
  quote,
  url: page,
};
const unavailable: LegalFinding = {
  status: 'no_finding',
  reasoning: '',
  citations: [],
  error: 'lookup_unavailable',
};

const saved: Record<string, LegalFinding> = {};
const save = async (ruleId: string, finding: LegalFinding) => {
  saved[ruleId] = finding;
};
const later = () => Date.now() + 60_000;

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of Object.keys(saved)) delete saved[key];
  sources.mockResolvedValue([page]);
  read.mockResolvedValue({ text, via: 'fetch' });
  assess.mockResolvedValue({
    status: 'conflicts',
    reasoning: 'The Act limits it.',
    citations: [citation],
  });
});

test('a document whose law is not checked is not looked up', async () => {
  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-001')],
    stored: {},
    meta: { ...meta, jurisdiction: 'MY', lawChecked: false },
    deadline: later(),
    save,
  });

  expect(findings).toEqual({});
  expect(sources).not.toHaveBeenCalled();
});

test('each rule that decides a bad or partly bad outcome is looked up once, most deciding first', async () => {
  await lookUpLaw({
    rules,
    outcomes: [
      outcome('s-1', 'bad', 'r-002'),
      outcome('s-2', 'partly_bad', 'r-003'),
      outcome('s-3', 'bad', 'r-003'),
      outcome('s-4', 'fine', 'r-001'),
      outcome('s-5', 'undetermined', 'r-004'),
      outcome('s-6', 'bad', null),
    ],
    stored: {},
    meta,
    deadline: later(),
    save,
  });

  expect(sources.mock.calls.map(([looked]) => looked.id)).toEqual([
    'r-003',
    'r-002',
  ]);
});

test('a finding is checked against the pages, saved and returned', async () => {
  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-002')],
    stored: {},
    meta,
    deadline: later(),
    save,
  });

  const expected = {
    status: 'conflicts',
    reasoning: 'The Act limits it.',
    citations: [citation],
    error: null,
  };
  expect(findings).toEqual({ 'r-002': expected });
  expect(saved).toEqual({ 'r-002': expected });
  expect(assess).toHaveBeenCalledWith(rules[1], meta, [{ url: page, text }]);
});

test('a citation whose quote is not on its page does not survive', async () => {
  assess.mockResolvedValue({
    status: 'conflicts',
    reasoning: 'r',
    citations: [
      { ...citation, quote: 'An insurer shall never refuse any claim at all.' },
    ],
  });

  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-002')],
    stored: {},
    meta,
    deadline: later(),
    save,
  });

  expect(findings['r-002']).toMatchObject({
    status: 'no_finding',
    error: null,
  });
});

test('a quote on a page only the model read is not taken as checked', async () => {
  // The text is the model's copy, so finding the quote in it proves nothing.
  read.mockResolvedValue({ text, via: 'url_context' });

  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-002')],
    stored: {},
    meta,
    deadline: later(),
    save,
  });

  expect(assess).toHaveBeenCalledWith(rules[1], meta, [{ url: page, text }]);
  expect(findings['r-002']).toEqual({
    status: 'no_finding',
    reasoning: 'The Act limits it.',
    citations: [],
    error: null,
  });
});

test('a search that finds no official page found nothing, which is not a failure', async () => {
  sources.mockResolvedValue([]);

  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-002')],
    stored: {},
    meta,
    deadline: later(),
    save,
  });

  expect(findings['r-002']).toEqual({ ...unavailable, error: null });
  expect(assess).not.toHaveBeenCalled();
});

test.each([
  ['the search fails', () => sources.mockRejectedValue(new Error('down'))],
  ['no page can be read', () => read.mockResolvedValue(null)],
  [
    'the assessment fails',
    () => assess.mockRejectedValue(new Error('timeout')),
  ],
])('the lookup is unavailable when %s', async (_, failure) => {
  failure();

  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-002')],
    stored: {},
    meta,
    deadline: later(),
    save,
  });

  expect(findings['r-002']).toEqual(unavailable);
  expect(saved['r-002']).toEqual(unavailable);
});

test('a stored finding is kept, and only an unavailable one is looked up again', async () => {
  const kept: LegalFinding = { ...unavailable, error: null };

  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-002'), outcome('s-2', 'bad', 'r-003')],
    stored: { 'r-002': kept, 'r-003': unavailable },
    meta,
    deadline: later(),
    save,
  });

  expect(sources.mock.calls.map(([looked]) => looked.id)).toEqual(['r-003']);
  expect(findings['r-002']).toBe(kept);
  expect(findings['r-003']).toMatchObject({ status: 'conflicts' });
});

test('no more lookups run at once than the limit', async () => {
  let running = 0;
  let most = 0;
  sources.mockImplementation(async () => {
    most = Math.max(most, ++running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return [page];
  });

  await lookUpLaw({
    rules,
    outcomes: rules.map(({ id }, n) => outcome(`s-${n}`, 'bad', id)),
    stored: {},
    meta,
    deadline: later(),
    save,
  });

  expect(sources).toHaveBeenCalledTimes(rules.length);
  expect(most).toBe(config.limits.law.atOnce);
});

test('a lookup not done by the deadline is unavailable', async () => {
  sources.mockImplementation(() => new Promise(() => {})); // never answers

  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-002')],
    stored: {},
    meta,
    deadline: Date.now() + 20,
    save,
  });

  expect(findings['r-002']).toEqual(unavailable);
});

test('a lookup not started by the deadline is unavailable without a search', async () => {
  const findings = await lookUpLaw({
    rules,
    outcomes: [outcome('s-1', 'bad', 'r-002')],
    stored: {},
    meta,
    deadline: Date.now() - 1,
    save,
  });

  expect(findings['r-002']).toEqual(unavailable);
  expect(sources).not.toHaveBeenCalled();
});
