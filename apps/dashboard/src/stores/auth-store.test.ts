import { afterEach, describe, expect, it, vi } from 'vitest';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useAuthStore } from './auth-store';

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  onAuthStateChanged: vi.fn(),
}));

// The store subscribes once at import; this is the listener it registered.
const [, emit] = vi.mocked(onAuthStateChanged).mock.calls[0] as unknown as [
  unknown,
  (user: Partial<User> | null) => void,
];

afterEach(() => {
  emit(null);
});

describe('useAuthStore', () => {
  it('starts signed out', () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('follows Firebase when a user signs in', () => {
    emit({
      uid: 'u1',
      displayName: 'Alice Example',
      email: 'alice@corp.com',
      photoURL: 'https://example.com/alice.png',
    });

    expect(useAuthStore.getState().user).toEqual({
      uid: 'u1',
      name: 'Alice Example',
      email: 'alice@corp.com',
      photoURL: 'https://example.com/alice.png',
    });
  });

  it('fills missing profile fields with empty strings', () => {
    emit({ uid: 'u2', displayName: null, email: null, photoURL: null });

    expect(useAuthStore.getState().user).toEqual({
      uid: 'u2',
      name: '',
      email: '',
      photoURL: '',
    });
  });

  it('clears the user when Firebase signs out', () => {
    emit({ uid: 'u1', displayName: 'Alice', email: 'a@b.co', photoURL: null });
    emit(null);

    expect(useAuthStore.getState().user).toBeNull();
  });

  it('keeps nothing in cookies', () => {
    emit({ uid: 'u1', displayName: 'Alice', email: 'a@b.co', photoURL: null });

    expect(document.cookie).toBe('');
  });
});
