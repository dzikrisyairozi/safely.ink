import { type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Analysis, AnalysisMeta } from '@repo/api-types';
import { ApiError } from '../../lib/api';
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
  detected: { docType: 'insurance', jurisdiction: 'ID' },
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
const show = (
  shown: Analysis,
  onConfirm = vi.fn(async () => {}),
  onRetry = vi.fn(async () => {}),
) => {
  render(
    <AnalysisView
      id="analysis-1"
      analysis={shown}
      traps={[]}
      rules={[]}
      scenarios={[]}
      clauses={[]}
      findings={[]}
      onConfirm={onConfirm}
      onRetry={onRetry}
    />,
  );
  return onConfirm;
};
const retryButton = () =>
  screen.getByRole('button', { name: 'Try this stage again' });
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
  expect(screen.getByLabelText('Country')).toHaveProperty('value', 'ID');
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
  fireEvent.change(screen.getByLabelText('Country'), {
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

test('a global document runs without a legal comparison', () => {
  show(
    analysis({ meta: { ...meta, jurisdiction: 'GLOBAL', lawChecked: false } }),
  );

  expect(screen.getByLabelText('Country')).toHaveProperty('value', 'GLOBAL');
  expect(screen.getByText(/No single country's law applies/)).toBeTruthy();
});

test('when the reader agrees with the pick, nothing is flagged', () => {
  show(analysis());

  expect(screen.queryByText(/may say something else/)).toBeNull();
});

test('a document with no country found is not a mismatch', () => {
  show(
    analysis({
      meta: { ...meta, detected: { docType: 'insurance', jurisdiction: '' } },
    }),
  );

  expect(screen.queryByText(/may say something else/)).toBeNull();
});

test('what the reader found instead of the pick is shown and can be taken', () => {
  show(
    analysis({
      meta: {
        ...meta,
        docType: 'nda',
        jurisdiction: 'JP',
        detected: { docType: 'insurance', jurisdiction: 'ID' },
      },
    }),
  );

  expect(screen.getByText(/Insurance policy/, { selector: 'li' })).toBeTruthy();
  expect(screen.getByText(/law of Indonesia/)).toBeTruthy();

  fireEvent.click(
    screen.getByRole('button', { name: 'Use what the document says' }),
  );

  expect(screen.getByLabelText('Document type')).toHaveProperty(
    'value',
    'insurance',
  );
  expect(screen.getByLabelText('Country')).toHaveProperty('value', 'ID');
  expect(screen.queryByText(/may say something else/)).toBeNull();
});

test('a country outside the list is named and switches to Global', () => {
  show(
    analysis({
      meta: { ...meta, detected: { docType: 'insurance', jurisdiction: 'US' } },
    }),
  );

  expect(screen.getByText(/United States/).textContent).toMatch(
    /not in the list/,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Use what the document says' }),
  );
  expect(screen.getByLabelText('Country')).toHaveProperty('value', 'GLOBAL');
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
  expect(retryButton()).toBeTruthy();
});

test('one rule is not called "1 rules"', () => {
  show(analysis({ status: 'fuzzing', counts: { clauses: 3, rules: 1 } }));

  expect(screen.getByText(/1 rule in it/)).toBeTruthy();
});

test('while situations are written and run, each stage says what is happening', () => {
  const counts = { clauses: 40, rules: 17, scenarios: 31 };

  show(analysis({ status: 'running', counts }));

  expect(screen.getByRole('heading').textContent).toBe('Testing the rules');
  expect(screen.getByText(/31 situations/)).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'How we read your document' }),
  ).toBeTruthy();
});

test('while the results are compared the number of situations is shown', () => {
  const counts = { clauses: 40, rules: 17, scenarios: 31 };

  show(analysis({ status: 'comparing', counts }));

  expect(screen.getByRole('heading').textContent).toBe(
    'Comparing with what you would expect',
  );
  expect(screen.getByText(/31 real-life situations/)).toBeTruthy();
});

test('a finished analysis is shown as its report', () => {
  show(analysis({ status: 'done', grade: 'C', confidence: 'medium' }));

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    meta.title,
  );
  expect(screen.getByText('Confidence: medium')).toBeTruthy();
});

test.each([
  ['fuzzing', 'The test situations could not be written'],
  ['running', 'The rules could not be tested'],
  ['comparing', 'The results could not be compared'],
] as const)('a run that fails at %s names that stage', (stage, title) => {
  show(analysis({ status: 'failed', stage }));

  expect(screen.getByRole('heading').textContent).toBe(title);
  expect(retryButton()).toBeTruthy();
});

test('a failed reading cannot be retried, only uploaded again', () => {
  show(analysis({ status: 'failed', stage: 'reading', meta: null }));

  expect(screen.queryByRole('button')).toBeNull();
});

test('retry starts the stage again and waits for the run', async () => {
  const onRetry = vi.fn(() => new Promise<void>(() => {}));
  show(analysis({ status: 'failed', stage: 'fuzzing' }), undefined, onRetry);

  fireEvent.click(retryButton());

  expect(onRetry).toHaveBeenCalledOnce();
  expect(
    (
      await screen.findByRole('button', { name: 'Starting again…' })
    ).hasAttribute('disabled'),
  ).toBe(true);
});

test('a retry over the daily limit says when it resets', async () => {
  show(
    analysis({ status: 'failed', stage: 'comparing' }),
    undefined,
    vi.fn(async () => {
      throw new ApiError(
        429,
        'daily_limit',
        'limit',
        '2026-10-15T00:00:00.000Z',
      );
    }),
  );

  fireEvent.click(retryButton());

  expect((await screen.findByRole('alert')).textContent).toMatch(
    /10 documents a day/,
  );
  expect(retryButton()).toHaveProperty('disabled', false);
});

test('a retry that does not go through can be tried again', async () => {
  show(
    analysis({ status: 'failed', stage: 'running' }),
    undefined,
    vi.fn(async () => {
      throw new Error('offline');
    }),
  );

  fireEvent.click(retryButton());

  expect((await screen.findByRole('alert')).textContent).toMatch(
    /Could not start again/,
  );
});

test('a finished report waits for its traps instead of saying there are none', () => {
  const done = analysis({
    status: 'done',
    grade: 'D',
    meta: { ...meta, userRole: 'insured' },
  });
  const report = (traps: [] | undefined) => (
    <AnalysisView
      id="analysis-1"
      analysis={done}
      traps={traps}
      rules={[]}
      scenarios={[]}
      clauses={[]}
      findings={[]}
      onConfirm={vi.fn(async () => {})}
      onRetry={vi.fn(async () => {})}
    />
  );
  const { rerender } = render(report(undefined));

  expect(screen.queryByText(/No situation ended worse/)).toBeNull();
  expect(screen.queryByText('D')).toBeNull();

  rerender(report([]));

  expect(screen.getByText(/No situation ended worse/)).toBeTruthy();
});
