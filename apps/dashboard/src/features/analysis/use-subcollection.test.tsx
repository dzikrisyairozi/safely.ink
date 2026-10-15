import { beforeEach, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { Clause } from '@repo/api-types';
import { useSubcollection } from './use-subcollection';

const unsubscribe = vi.fn();
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  onSnapshot: vi.fn(() => unsubscribe),
}));

// What the hook passed to the listener: (reference, onNext, onError).
const answer = (documents: unknown[]) => {
  const [, onNext] = vi.mocked(onSnapshot).mock.calls.at(-1)! as unknown as [
    unknown,
    (snapshot: { docs: { data: () => unknown }[] }) => void,
  ];
  act(() => onNext({ docs: documents.map((data) => ({ data: () => data })) }));
};
const clause = (id: string) => ({
  id,
  number: null,
  heading: null,
  text: 'The insurer pays within 30 days.',
  gloss: null,
  page: 1,
});

beforeEach(() => {
  vi.mocked(onSnapshot).mockClear();
  unsubscribe.mockClear();
});

test('nothing is known until the listener answers, then the documents are given', () => {
  const { result } = renderHook(() =>
    useSubcollection('analysis-1', 'clauses', Clause),
  );
  expect(result.current).toBeUndefined();

  answer([clause('c-001'), clause('c-002')]);

  expect(result.current?.map((c) => c.id)).toEqual(['c-001', 'c-002']);
});

test('a document that does not fit the schema is left out', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() =>
    useSubcollection('analysis-1', 'clauses', Clause),
  );

  answer([clause('c-001'), { id: 'c-002', page: 'two' }]);

  expect(result.current?.map((c) => c.id)).toEqual(['c-001']);
});

test('another analysis never shows the documents of the previous one', () => {
  const { result, rerender } = renderHook(
    ({ id }) => useSubcollection(id, 'clauses', Clause),
    { initialProps: { id: 'analysis-1' } },
  );
  answer([clause('c-001')]);

  rerender({ id: 'analysis-2' });

  expect(result.current).toBeUndefined();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('a listener that fails gives null, which is not an empty list', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() =>
    useSubcollection('analysis-1', 'clauses', Clause),
  );
  const onError = vi.mocked(onSnapshot).mock.calls.at(-1)![2] as unknown as (
    error: Error,
  ) => void;

  act(() => onError(new Error('unavailable')));

  expect(result.current).toBeNull();
});
