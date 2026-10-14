import { type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type {
  Analysis,
  AnalysisMeta,
  Clause,
  Rule,
  StoredScenario,
  Trap,
} from '@repo/api-types';
import { ReportView } from './report-view';

// A plain anchor stands in for the router; the hash is what makes a clause
// one click away.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    hash,
    children,
  }: {
    to: string;
    hash?: string;
    children: ReactNode;
  }) => <a href={hash ? `${to}#${hash}` : to}>{children}</a>,
}));

const meta: AnalysisMeta = {
  docType: 'insurance',
  title: 'Polis Asuransi Kesehatan Sehat Prima',
  parties: [
    { name: 'PT Asuransi Sehat Prima', role: 'insurer' },
    { name: 'Budi Santoso', role: 'insured' },
  ],
  userRole: 'insured',
  jurisdiction: 'ID',
  lawChecked: true,
  detected: { docType: 'insurance', jurisdiction: 'ID' },
  language: 'id',
  pageCount: 12,
  unreadablePages: [],
};
const analysis: Analysis = {
  ownerUid: 'alice',
  status: 'done',
  meta,
  grade: 'B',
  confidence: 'medium',
  createdAt: { seconds: 1_760_400_000 },
  counts: {
    scenarios: 3,
    fine: 1,
    partlyBad: 0,
    bad: 1,
    undetermined: 1,
    traps: 2,
  },
};
const clause = (id: string, number: string, page: number): Clause => ({
  id,
  number,
  heading: null,
  text: `Text of ${number}.`,
  gloss: null,
  page,
});
const rule = (id: string, kind: Rule['kind'], clauseId: string): Rule => ({
  id,
  kind,
  summary: `Summary of ${id}.`,
  clauseIds: [clauseId],
  when: kind === 'unmodeled' ? null : { fact: 'days', op: 'lt', value: 30 },
  effect: null,
  touches: [],
});
const outcome = (
  scenarioId: string,
  result: 'fine' | 'bad' | 'undetermined',
  ruleId: string,
) => ({
  scenarioId,
  result,
  stake: 1000,
  loss: result === 'bad' ? 1000 : 0,
  decidingRuleId: ruleId,
  trace: [{ ruleId, fact: null, note: '' }],
});
const scenarios: StoredScenario[] = [
  {
    id: 's-001',
    story: 'Budi is admitted in the second week.',
    strategy: 'boundary',
    frequency: 'common',
    targetRuleIds: ['r-001'],
    stake: 1000,
    facts: {},
    outcome: outcome('s-001', 'bad', 'r-001'),
    expectation: { result: 'fine', reason: 'A hospital stay is covered.' },
  },
  {
    id: 's-002',
    story: 'Budi has a routine check-up.',
    strategy: 'baseline',
    frequency: 'common',
    targetRuleIds: [],
    stake: 1000,
    facts: {},
    outcome: outcome('s-002', 'fine', 'r-002'),
  },
  {
    id: 's-003',
    story: 'Budi is treated abroad.',
    strategy: 'definition',
    frequency: 'rare',
    targetRuleIds: [],
    stake: 1000,
    facts: {},
    outcome: outcome('s-003', 'undetermined', 'r-003'),
  },
];
const traps: Trap[] = [
  {
    id: 'trap-r-004',
    ruleId: 'r-004',
    scenarioIds: ['s-001'],
    severity: 'low',
    title: null,
    action: null,
  },
  {
    id: 'trap-r-001',
    ruleId: 'r-001',
    scenarioIds: ['s-001'],
    severity: 'high',
    title: 'A stay in the first 30 days is not paid',
    action: null,
  },
];
const rules = [
  rule('r-001', 'exclusion', 'c-001'),
  rule('r-002', 'benefit', 'c-002'),
  rule('r-003', 'unmodeled', 'c-003'),
  rule('r-004', 'charge', 'c-001'),
];
const clauses = [
  clause('c-001', '4.1', 3),
  clause('c-002', '2.1', 2),
  clause('c-003', '9', 7),
];

const show = (changes: Partial<AnalysisMeta> = {}) =>
  render(
    <ReportView
      id="analysis-1"
      analysis={analysis}
      meta={{ ...meta, ...changes }}
      traps={traps}
      rules={rules}
      scenarios={scenarios}
      clauses={clauses}
    />,
  );
const section = (title: string) =>
  screen.getByRole('heading', { name: title }).parentElement!;
const clauseLinks = (within: HTMLElement) =>
  [...within.querySelectorAll('a')]
    .map((link) => link.getAttribute('href'))
    .filter((href) => href?.includes('#'));

test('the disclaimer comes before anything else', () => {
  show();

  const disclaimer = screen.getByText(/not legal advice/);
  const firstTrap = screen.getByText('A stay in the first 30 days is not paid');
  expect(
    disclaimer.compareDocumentPosition(firstTrap) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test('the header names the other party, the country, the grade and the counts', () => {
  show();

  expect(screen.getByText('PT Asuransi Sehat Prima')).toBeTruthy();
  expect(screen.getByText('Indonesia')).toBeTruthy();
  expect(screen.getByText('insured')).toBeTruthy();
  expect(document.querySelector('[data-grade]')?.textContent).toBe('B');
  expect(screen.getByText('Confidence: medium')).toBeTruthy();
  expect(
    screen.getByText('Unclear', { selector: 'dt' }).nextSibling?.textContent,
  ).toBe('1');
  expect(screen.getByText(/law of Indonesia is not checked/)).toBeTruthy();
});

test('traps come worst first, each with the expectation, the rule and its clause', () => {
  show();

  const rows = within(section('Traps')).getAllByRole('listitem');
  expect(rows[0]!.textContent).toMatch(/^A stay in the first 30 days/);
  expect(rows[0]!.textContent).toMatch(
    /You'd expectA hospital stay is covered/,
  );
  expect(rows[0]!.textContent).toMatch(/The document saysSummary of r-001/);
  // A trap without a title is named by its rule.
  expect(rows[1]!.textContent).toMatch(/^Summary of r-004/);
  for (const row of rows) {
    expect(clauseLinks(row)).toEqual(['/analyses/$id/rules#c-001']);
  }
});

test('what works and what is unclear each point at their clauses', () => {
  show();

  const favour = section('What works in your favour');
  expect(favour.textContent).toMatch(/routine check-up/);
  expect(clauseLinks(favour)).toEqual(['/analyses/$id/rules#c-002']);

  const unclear = section('Unclear, read these clauses yourself');
  expect(unclear.textContent).toMatch(/treated abroad/);
  expect(unclear.textContent).toMatch(/Depends on: Summary of r-003/);
  expect(clauseLinks(unclear)).toEqual(['/analyses/$id/rules#c-003']);
});

test('the grade formula is there on request and adds up for this report', () => {
  show();

  const formula = screen.getByText(
    'How the grade is worked out',
  ).parentElement!;
  expect(formula.tagName).toBe('DETAILS');
  expect(formula.textContent).toMatch(/Critical: 20 points/);
  expect(formula.textContent).toMatch(/This report: 88 points, grade B/);
});

test('a global general analysis says both', () => {
  show({ docType: 'other', jurisdiction: 'GLOBAL', lawChecked: false });

  expect(screen.getByText(/^General analysis/)).toBeTruthy();
  expect(screen.getByText(/^Global: no single country/)).toBeTruthy();
});

test('unreadable pages mark the report as incomplete', () => {
  show({ unreadablePages: [3, 7] });

  expect(
    screen.getByText('Incomplete document').parentElement?.textContent,
  ).toMatch(/Page 3, 7 could not/);
});
