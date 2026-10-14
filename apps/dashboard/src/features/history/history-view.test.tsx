import { type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { AnalysisMeta } from '@repo/api-types';
import { HistoryView } from './history-view';
import type { HistoryEntry } from './use-history';

// A plain anchor stands in for the router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params?: { id: string };
    children: ReactNode;
  }) => <a href={params ? to.replace('$id', params.id) : to}>{children}</a>,
}));

const meta: AnalysisMeta = {
  docType: 'insurance',
  title: 'Polis Asuransi Kesehatan Sehat Prima',
  parties: [],
  userRole: 'insured',
  jurisdiction: 'ID',
  lawChecked: true,
  detected: { docType: 'insurance', jurisdiction: 'ID' },
  language: 'id',
  pageCount: 12,
  unreadablePages: [],
};
const createdAt = { seconds: Date.UTC(2026, 9, 14) / 1000 };
const done: HistoryEntry = {
  id: 'analysis-1',
  status: 'done',
  meta,
  grade: 'C',
  createdAt,
};
const running: HistoryEntry = {
  id: 'analysis-2',
  status: 'fuzzing',
  meta: {
    ...meta,
    title: 'Sewa Rumah',
    docType: 'lease',
    jurisdiction: 'GLOBAL',
  },
  createdAt,
  updatedAt: { seconds: Math.floor(Date.now() / 1000) },
};
const rejected: HistoryEntry = {
  id: 'analysis-3',
  status: 'rejected',
  meta: null,
  createdAt,
};

const row = (title: string) =>
  screen.getByRole('link', { name: new RegExp(title) }).closest('li')!;

test('each analysis shows its title, type, country, date, grade and status', () => {
  render(<HistoryView entries={[done]} />);
  const item = within(row('Polis Asuransi'));

  expect(item.getByText('Polis Asuransi Kesehatan Sehat Prima')).toBeTruthy();
  expect(item.getByText(/Insurance policy/)).toBeTruthy();
  expect(item.getByText(/Indonesia/)).toBeTruthy();
  expect(item.getByText(/2026/)).toBeTruthy();
  expect(item.getByText('C')).toBeTruthy();
  expect(item.getByText('Done')).toBeTruthy();
});

test('the analyses keep the order they were given, and each opens its own page', () => {
  render(<HistoryView entries={[running, done]} />);

  expect(
    screen.getAllByRole('link').map((link) => link.getAttribute('href')),
  ).toEqual(['/analyses/analysis-2', '/analyses/analysis-1']);
});

test('a running analysis says so and has no grade yet', () => {
  render(<HistoryView entries={[running]} />);
  const item = within(row('Sewa Rumah'));

  expect(item.getByText('Writing scenarios')).toBeTruthy();
  expect(item.getByText(/Global/)).toBeTruthy();
  expect(item.getByText('–')).toBeTruthy();
});

test('each analysis can be deleted from its row, but not while it runs', () => {
  render(<HistoryView entries={[running, done]} />);
  const deleteIn = (title: string) =>
    within(row(title)).getByRole('button', { name: 'Delete' });

  expect(deleteIn('Polis Asuransi').hasAttribute('disabled')).toBe(false);
  expect(deleteIn('Sewa Rumah').hasAttribute('disabled')).toBe(true);
});

test('an analysis that was never read is listed as untitled', () => {
  render(<HistoryView entries={[rejected]} />);
  const item = within(row('Untitled document'));

  expect(item.getByText('Not a policy or contract')).toBeTruthy();
  expect(item.queryByText(/Insurance policy/)).toBeNull();
});

test('an analysis that could not be read at all can still be deleted', () => {
  render(<HistoryView entries={[{ id: 'analysis-4', meta: null }]} />);
  const item = within(row('Untitled document'));

  // No status to name, and no key shown in its place.
  expect(item.queryByText(/status/)).toBeNull();
  expect(
    item.getByRole('button', { name: 'Delete' }).hasAttribute('disabled'),
  ).toBe(false);
});

test('with no analyses, the screen points to a new one', () => {
  render(<HistoryView entries={[]} />);

  expect(
    screen.getByRole('link', { name: /Check a document/ }).getAttribute('href'),
  ).toBe('/');
});
