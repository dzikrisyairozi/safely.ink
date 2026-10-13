import { beforeEach, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useAnalysis } from './use-analysis';

vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  onSnapshot: vi.fn(() => () => {}),
}));

// What the hook passed to the listener: (reference, onNext, onError).
const listener = () => {
  const [, onNext, onError] = vi
    .mocked(onSnapshot)
    .mock.calls.at(-1)! as unknown as [
    unknown,
    (snapshot: { data: () => unknown }) => void,
    (error: { code: string }) => void,
  ];
  return { onNext, onError };
};
const reading = { ownerUid: 'alice', status: 'reading', meta: null };

beforeEach(() => {
  vi.mocked(onSnapshot).mockClear();
});

test('nothing is known until the listener answers, then the document is given', () => {
  const { result } = renderHook(() => useAnalysis('analysis-1'));
  expect(result.current).toEqual({ analysis: undefined, failed: false });

  act(() => listener().onNext({ data: () => reading }));

  expect(result.current).toEqual({ analysis: reading, failed: false });
});

test("a missing document and someone else's document are both not found", () => {
  const { result } = renderHook(() => useAnalysis('analysis-1'));

  act(() => listener().onNext({ data: () => undefined }));
  expect(result.current).toEqual({ analysis: null, failed: false });

  act(() => listener().onError({ code: 'permission-denied' }));
  expect(result.current).toEqual({ analysis: null, failed: false });
});

test('a document the dashboard cannot read is an error, not "not found"', () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() => useAnalysis('analysis-1'));

  act(() => listener().onNext({ data: () => ({ status: 'no such state' }) }));

  expect(result.current.failed).toBe(true);
  expect(logged).toHaveBeenCalled();
  logged.mockRestore();
});

test('a listener that stops for another reason is an error', () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() => useAnalysis('analysis-1'));

  act(() => listener().onError({ code: 'unavailable' }));

  expect(result.current.failed).toBe(true);
  logged.mockRestore();
});

test('another analysis does not show the previous one while it loads', () => {
  const { result, rerender } = renderHook(({ id }) => useAnalysis(id), {
    initialProps: { id: 'analysis-1' },
  });
  act(() => listener().onNext({ data: () => reading }));

  rerender({ id: 'analysis-2' });

  expect(result.current).toEqual({ analysis: undefined, failed: false });
});
