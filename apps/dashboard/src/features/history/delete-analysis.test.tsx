import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RUN_STALE_SECONDS } from '@repo/api-types';
import { api, ApiError } from '../../lib/api';
import { DeleteAnalysis } from './delete-analysis';

vi.mock('../../lib/api', async (original) => ({
  ...(await original<typeof import('../../lib/api')>()),
  api: vi.fn(),
}));

const secondsAgo = (seconds: number) => ({
  seconds: Math.floor(Date.now() / 1000) - seconds,
});
const done = { status: 'done', updatedAt: secondsAgo(60) } as const;

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ analysisId: 'analysis-1' });
});

const openDialog = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

test('confirming deletes the analysis through the API, once', async () => {
  const onDeleted = vi.fn();
  render(
    <DeleteAnalysis id="analysis-1" analysis={done} onDeleted={onDeleted} />,
  );

  openDialog();
  expect(screen.getByText(/cannot be undone/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));

  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith('/v1/analyses/analysis-1', {
    method: 'DELETE',
  });
});

test('cancelling deletes nothing', () => {
  render(<DeleteAnalysis id="analysis-1" analysis={done} />);

  openDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(api).not.toHaveBeenCalled();
});

test('a run that is going on cannot be deleted, and the button says why', () => {
  render(
    <DeleteAnalysis
      id="analysis-1"
      analysis={{ status: 'running', updatedAt: secondsAgo(60) }}
    />,
  );
  const button = screen.getByRole('button', { name: 'Delete' });

  expect(button.hasAttribute('disabled')).toBe(true);
  expect(button.getAttribute('title')).toMatch(/when the run ends/);
});

test('a run not heard from for long can be deleted', () => {
  render(
    <DeleteAnalysis
      id="analysis-1"
      analysis={{
        status: 'running',
        updatedAt: secondsAgo(RUN_STALE_SECONDS + 60),
      }}
    />,
  );

  expect(
    screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled'),
  ).toBe(false);
});

test('a delete that fails says so and can be tried again', async () => {
  vi.mocked(api).mockRejectedValueOnce(
    new ApiError(500, 'internal', 'Something went wrong.'),
  );
  render(<DeleteAnalysis id="analysis-1" analysis={done} />);

  openDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));

  expect(await screen.findByText(/could not be deleted/)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled'),
  ).toBe(false);
});

test('a run that started meanwhile is named as the reason', async () => {
  vi.mocked(api).mockRejectedValueOnce(
    new ApiError(409, 'conflict', 'This analysis is still running.'),
  );
  render(<DeleteAnalysis id="analysis-1" analysis={done} />);

  openDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));

  expect(await screen.findByText(/when the run ends/)).toBeTruthy();
});
