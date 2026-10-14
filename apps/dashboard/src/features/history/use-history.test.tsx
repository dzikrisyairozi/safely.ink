import { beforeEach, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { onSnapshot, orderBy, where } from 'firebase/firestore';
import { useAuthStore } from '../../stores/auth-store';
import { useHistory } from './use-history';

const unsubscribe = vi.fn();
vi.mock('firebase/firestore', async (original) => {
  const firestore = await original<typeof import('firebase/firestore')>();
  return {
    ...firestore,
    onSnapshot: vi.fn(() => unsubscribe),
    where: vi.fn(firestore.where),
    orderBy: vi.fn(firestore.orderBy),
  };
});
// The test signs in by setting the store, not through Firebase.
vi.mock('firebase/auth', async (original) => ({
  ...(await original<typeof import('firebase/auth')>()),
  onAuthStateChanged: vi.fn(),
}));

const signIn = (uid: string | null) =>
  useAuthStore.setState({
    user: uid === null ? null : { uid, name: '', email: '', photoURL: '' },
  });
// What the hook passed to the listener: (query, onNext, onError).
const answer = (documents: [string, unknown][]) => {
  const [, onNext] = vi.mocked(onSnapshot).mock.calls.at(-1)! as unknown as [
    unknown,
    (snapshot: { docs: { id: string; data: () => unknown }[] }) => void,
  ];
  act(() =>
    onNext({ docs: documents.map(([id, data]) => ({ id, data: () => data })) }),
  );
};
const analysis = (status: string) => ({
  ownerUid: 'alice',
  status,
  meta: null,
});

beforeEach(() => {
  vi.mocked(onSnapshot).mockClear();
  vi.mocked(where).mockClear();
  vi.mocked(orderBy).mockClear();
  unsubscribe.mockClear();
  signIn('alice');
});

test("the signed-in user's analyses are asked for, newest first", () => {
  renderHook(() => useHistory());

  expect(where).toHaveBeenCalledWith('ownerUid', '==', 'alice');
  expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
});

test('the analyses come in the order of the answer, with their IDs', () => {
  const { result } = renderHook(() => useHistory());
  expect(result.current).toBeUndefined();

  answer([
    ['analysis-2', analysis('running')],
    ['analysis-1', analysis('done')],
  ]);

  expect(result.current?.map(({ id, status }) => [id, status])).toEqual([
    ['analysis-2', 'running'],
    ['analysis-1', 'done'],
  ]);
});

test('an analysis from before a field of its details was required is listed with them', () => {
  const { result } = renderHook(() => useHistory());

  // No lawChecked or detected: stored before they were required.
  answer([
    [
      'analysis-1',
      {
        ...analysis('done'),
        meta: { title: 'Old policy', docType: 'insurance', jurisdiction: 'ID' },
      },
    ],
  ]);

  expect(result.current).toMatchObject([
    { id: 'analysis-1', status: 'done', meta: { title: 'Old policy' } },
  ]);
});

test('an analysis that fits no schema is listed untitled, so it can still be deleted', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() => useHistory());

  answer([
    ['analysis-1', analysis('done')],
    ['analysis-2', analysis('thinking')],
  ]);

  expect(result.current).toEqual([
    expect.objectContaining({ id: 'analysis-1', status: 'done' }),
    { id: 'analysis-2', meta: null },
  ]);
});

test('a listener that fails gives null, which is not an empty list', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() => useHistory());
  const onError = vi.mocked(onSnapshot).mock.calls.at(-1)![2] as unknown as (
    error: Error,
  ) => void;

  act(() => onError(new Error('failed-precondition')));

  expect(result.current).toBeNull();
});

test('nothing is asked for while no one is signed in', () => {
  signIn(null);

  const { result } = renderHook(() => useHistory());

  expect(onSnapshot).not.toHaveBeenCalled();
  expect(result.current).toBeUndefined();
});

test('the listener stops when the screen goes', () => {
  const { unmount } = renderHook(() => useHistory());

  unmount();

  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
