import { type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Analysis, AnalysisMeta } from '@repo/api-types';
import { AnalysisView } from './analysis-view';

// The view only links back to the upload page; a plain anchor stands in for
// the router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const meta: AnalysisMeta = {
  docType: 'insurance',
  title: 'Polis Asuransi Kesehatan Sehat Prima',
  parties: [
    { name: 'PT Asuransi Sehat Prima', role: 'insurer' },
    { name: 'Budi Santoso', role: 'insured' },
  ],
  userRole: null,
  jurisdiction: 'ID',
  lawChecked: true,
  language: 'id',
  pageCount: 12,
  unreadablePages: [],
};
const analysis = (changes: Partial<Analysis> = {}): Analysis => ({
  ownerUid: 'alice',
  status: 'awaiting_confirmation',
  meta,
  ...changes,
});
const show = (shown: Analysis, onConfirm = vi.fn(async () => {})) => {
  render(
    <AnalysisView id="analysis-1" analysis={shown} onConfirm={onConfirm} />,
  );
  return onConfirm;
};
const confirmButton = () =>
  screen.getByRole('button', { name: 'These details are right' });

test('the detected details are shown for the user to check', () => {
  show(analysis());

  expect(screen.getByRole('heading').textContent).toBe(meta.title);
  expect(screen.getByText(/12 pages/).textContent).toContain('ID');
  expect(screen.getByLabelText('Document type')).toHaveProperty(
    'value',
    'insurance',
  );
  expect(screen.getByLabelText('Governing country')).toHaveProperty(
    'value',
    'ID',
  );
  expect(screen.getByText('PT Asuransi Sehat Prima')).toBeTruthy();
  expect(screen.getByText('Budi Santoso')).toBeTruthy();
});

test('nothing can be confirmed until the user says which party they are', () => {
  show(analysis());

  expect(confirmButton()).toHaveProperty('disabled', true);

  fireEvent.click(screen.getByLabelText(/Budi Santoso/));

  expect(confirmButton()).toHaveProperty('disabled', false);
});

test('the corrected type and country are what gets confirmed', async () => {
  const onConfirm = show(analysis());

  fireEvent.change(screen.getByLabelText('Document type'), {
    target: { value: 'loan' },
  });
  fireEvent.change(screen.getByLabelText('Governing country'), {
    target: { value: 'SG' },
  });
  fireEvent.click(screen.getByLabelText(/Budi Santoso/));
  fireEvent.click(confirmButton());

  await waitFor(() =>
    expect(onConfirm).toHaveBeenCalledWith({
      docType: 'loan',
      jurisdiction: 'SG',
      userRole: 'insured',
    }),
  );
});

test('a country without a law check is named, and the run is not blocked', () => {
  show(analysis({ meta: { ...meta, jurisdiction: 'MY', lawChecked: false } }));

  expect(screen.getByText(/law of Malaysia/).textContent).toMatch(
    /scenarios still run/,
  );
  fireEvent.click(screen.getByLabelText(/Budi Santoso/));
  expect(confirmButton()).toHaveProperty('disabled', false);
});

test('a type outside the tuned five is announced as a general analysis', () => {
  show(analysis({ meta: { ...meta, docType: 'other' } }));

  expect(screen.getByText(/general analysis/)).toBeTruthy();
});

test('unreadable pages are listed by number with a way to upload again', () => {
  show(analysis({ meta: { ...meta, unreadablePages: [3, 7] } }));

  const alert = screen.getByRole('alert');
  expect(alert.textContent).toMatch(/Page 3, 7 /);
  expect(alert.querySelector('a')?.getAttribute('href')).toBe('/');
});

test('a document with no parties found lets the user type their role', async () => {
  const onConfirm = show(analysis({ meta: { ...meta, parties: [] } }));

  fireEvent.change(screen.getByLabelText('Which party are you?'), {
    target: { value: 'tenant' },
  });
  fireEvent.click(confirmButton());

  await waitFor(() =>
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ userRole: 'tenant' }),
    ),
  );
});

test('a failed save is reported and can be tried again', async () => {
  show(
    analysis(),
    vi.fn(async () => {
      throw new Error('offline');
    }),
  );
  fireEvent.click(screen.getByLabelText(/Budi Santoso/));

  fireEvent.click(confirmButton());

  expect((await screen.findByRole('alert')).textContent).toMatch(/try again/);
  expect(confirmButton()).toHaveProperty('disabled', false);
});

test('a rejected upload shows why and offers another upload', () => {
  show(analysis({ status: 'rejected', meta: null }));

  expect(
    screen.getByText(/doesn't look like a policy or contract/),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Upload another document' }),
  ).toBeTruthy();
});

test('a failed reading says so and offers to upload again', () => {
  show(analysis({ status: 'failed', stage: 'reading', meta: null }));

  expect(screen.getByRole('heading').textContent).toBe(
    'Reading did not finish',
  );
  expect(screen.getByRole('link', { name: 'Upload it again' })).toBeTruthy();
});

test('after confirmation the form is gone and the rules are being worked out', () => {
  show(analysis({ status: 'extracting_rules' }));

  expect(screen.getByRole('heading').textContent).toBe('Working out the rules');
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
});

test('once the rules exist their number is shown with the way to read them', () => {
  show(analysis({ status: 'fuzzing', counts: { clauses: 40, rules: 17 } }));

  expect(screen.getByText(/17 rules/)).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: 'How we read your document' })
      .getAttribute('href'),
  ).toBe('/analyses/$id/rules');
});

test('a failed rules stage names the stage', () => {
  show(analysis({ status: 'failed', stage: 'extracting_rules' }));

  expect(screen.getByRole('heading').textContent).toBe(
    'The rules could not be worked out',
  );
  expect(screen.getByRole('link', { name: 'Upload it again' })).toBeTruthy();
});
