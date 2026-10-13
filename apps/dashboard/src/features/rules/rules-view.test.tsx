import { type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Analysis, Clause, Rule } from '@repo/api-types';
import { RulesView } from './rules-view';

// The view only links back to the analysis; a plain anchor stands in for
// the router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const analysis: Analysis = {
  ownerUid: 'alice',
  status: 'fuzzing',
  meta: {
    docType: 'insurance',
    title: 'Polis Asuransi Kesehatan Sehat Prima',
    parties: [{ name: 'Budi Santoso', role: 'insured' }],
    userRole: 'insured',
    jurisdiction: 'ID',
    lawChecked: true,
    language: 'id',
    pageCount: 12,
    unreadablePages: [],
  },
  factSchema: [
    {
      key: 'daysSinceStart',
      type: 'number',
      values: null,
      unit: 'days',
      description: 'Days since the agreement started',
      neutral: 0,
    },
  ],
};
const clauses: Clause[] = [
  {
    id: 'c-001',
    number: '1.1',
    heading: 'Pertanggungan',
    text: 'Penanggung akan membayar biaya rawat inap.',
    gloss: 'The insurer will pay inpatient costs.',
    page: 2,
  },
  {
    id: 'c-002',
    number: null,
    heading: 'Masa Tunggu',
    text: 'Klaim dalam 30 hari tidak dibayar.',
    gloss: null,
    page: 5,
  },
];
const rule = (changes: Partial<Rule>): Rule => ({
  id: 'r-001',
  kind: 'benefit',
  summary: 'The insurer pays your hospital stay.',
  clauseIds: ['c-001'],
  when: null,
  effect: null,
  touches: [],
  ...changes,
});
const rules: Rule[] = [
  rule({
    id: 'r-001',
    kind: 'unmodeled',
    summary: 'The insurer decides what is reasonable.',
  }),
  rule({
    id: 'r-002',
    kind: 'exclusion',
    summary: 'Nothing is paid in the first 30 days.',
    clauseIds: ['c-002'],
    when: { fact: 'daysSinceStart', op: 'lt', value: 30 },
  }),
  rule({ id: 'r-003', kind: 'benefit' }),
];

const show = (shown = rules) =>
  render(
    <RulesView
      id="analysis-1"
      analysis={analysis}
      rules={shown}
      clauses={clauses}
    />,
  );
const headings = () =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

test('the rules are grouped by kind, benefits first and unclear clauses last', () => {
  show();

  expect(headings()).toEqual([
    'What you get',
    'When it does not apply',
    'Read these yourself',
    'The facts we look at',
    'The clauses',
  ]);
});

test('a rule shows its condition in words and links to its clause on the page', () => {
  const { container } = show();

  const item = screen
    .getByText('Nothing is paid in the first 30 days.')
    .closest('li')!;
  expect(item.textContent).toContain(
    'Days since the agreement started: less than 30 days',
  );
  const link = within(item).getByRole('link', { name: 'Clause, page 5' });
  expect(link.getAttribute('href')).toBe('#c-002');

  const target = container.querySelector('#c-002')!;
  expect(target.textContent).toContain('Klaim dalam 30 hari tidak dibayar.');
  expect(target.textContent).toContain('page 5');
});

test('a clause shows its number, its English gloss and its page', () => {
  const { container } = show();

  const clause = container.querySelector('#c-001')!;
  expect(clause.textContent).toContain('Clause 1.1, page 2');
  expect(clause.textContent).toContain('The insurer will pay inpatient costs.');
});

test('every fact is shown by its plain description, not by its key', () => {
  show();

  const facts = screen
    .getByRole('heading', { name: 'The facts we look at' })
    .closest('section')!;
  expect(facts.textContent).toContain('Days since the agreement started');
  expect(facts.textContent).not.toContain('daysSinceStart');
});

test('before the rules exist the screen says so', () => {
  show([]);

  // getByText throws when the text is not there.
  screen.getByText('The rules of this document are not ready yet.');
  expect(headings()).toEqual(['The facts we look at', 'The clauses']);
});
