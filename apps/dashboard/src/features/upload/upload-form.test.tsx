import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '../../lib/api';
import { startAnalysis } from './start-analysis';
import { UploadForm } from './upload-form';

vi.mock('./start-analysis');
const start = vi.mocked(startAnalysis);

const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const pick = (...files: File[]) =>
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files },
  });
const pages = () =>
  screen
    .getAllByRole('listitem')
    .map((item) => item.querySelector('[data-page-name]')?.textContent)
    .filter(Boolean);
const startButton = () =>
  screen.getByRole('button', { name: 'Check this document' });

// Braces matter: a function returned from beforeEach is run as its cleanup.
beforeEach(() => {
  start.mockReset();
});

test('both notices are shown before anything is uploaded', () => {
  render(<UploadForm onRead={() => {}} />);

  expect(screen.getByText(/not legal advice/i)).toBeTruthy();
  expect(screen.getByText(/deleted after 7 days/i)).toBeTruthy();
  expect(startButton()).toHaveProperty('disabled', true);
});

test('picked photos become pages in the order given, and more can be added', () => {
  render(<UploadForm onRead={() => {}} />);

  pick(photo('one.jpg'), photo('two.jpg'));
  pick(photo('three.jpg'));

  expect(pages()).toEqual(['one.jpg', 'two.jpg', 'three.jpg']);
});

test('a page can be moved up, moved down and removed', () => {
  render(<UploadForm onRead={() => {}} />);
  pick(photo('one.jpg'), photo('two.jpg'), photo('three.jpg'));

  fireEvent.click(screen.getByLabelText('Move three.jpg up'));
  expect(pages()).toEqual(['one.jpg', 'three.jpg', 'two.jpg']);

  fireEvent.click(screen.getByLabelText('Move one.jpg down'));
  expect(pages()).toEqual(['three.jpg', 'one.jpg', 'two.jpg']);

  fireEvent.click(screen.getByLabelText('Remove one.jpg'));
  expect(pages()).toEqual(['three.jpg', 'two.jpg']);
});

test('a file of the wrong type is refused and the pages already there stay', () => {
  render(<UploadForm onRead={() => {}} />);
  pick(photo('one.jpg'));

  pick(new File(['x'], 'notes.docx', { type: 'application/msword' }));

  expect(screen.getByRole('alert').textContent).toMatch(/JPEG, PNG, WebP/);
  expect(pages()).toEqual(['one.jpg']);
});

test('starting uploads the pages in their final order and opens the analysis', async () => {
  start.mockResolvedValue({
    analysisId: 'analysis-1',
    status: 'awaiting_confirmation',
  });
  const onRead = vi.fn();
  render(<UploadForm onRead={onRead} />);
  pick(photo('one.jpg'), photo('two.jpg'));
  fireEvent.click(screen.getByLabelText('Move two.jpg up'));

  fireEvent.click(startButton());

  await waitFor(() => expect(onRead).toHaveBeenCalledWith('analysis-1'));
  expect(start.mock.calls[0]![0].map((file) => file.name)).toEqual([
    'two.jpg',
    'one.jpg',
  ]);
});

test('the daily limit message says when it resets', async () => {
  start.mockRejectedValue(
    new ApiError(429, 'daily_limit', 'limit', '2026-10-14T00:00:00.000Z'),
  );
  render(<UploadForm onRead={() => {}} />);
  pick(photo('one.jpg'));

  fireEvent.click(startButton());

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/10 documents a day/);
  expect(alert.textContent).toMatch(/\d{2}[:.]\d{2}/);
  expect(startButton()).toHaveProperty('disabled', false);
});

test('a document with too many pages is explained with the limit', async () => {
  start.mockRejectedValue(new ApiError(400, 'too_many_pages', 'too many'));
  render(<UploadForm onRead={() => {}} />);
  pick(new File(['x'], 'policy.pdf', { type: 'application/pdf' }));

  fireEvent.click(startButton());

  expect((await screen.findByRole('alert')).textContent).toMatch(/100 pages/);
});
