import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCurrentUser } from './use-current-user';
import { useAuthStore } from '../stores/auth-store';

afterEach(() => {
  useAuthStore.setState({ user: null });
});

describe('useCurrentUser', () => {
  it('is blank when nobody is signed in', () => {
    const { result } = renderHook(() => useCurrentUser());

    expect(result.current).toEqual({ name: '', email: '', avatar: '' });
  });

  it('maps the signed-in user to name, email and avatar', () => {
    useAuthStore.setState({
      user: {
        uid: 'u1',
        name: 'Alice Example',
        email: 'alice@corp.com',
        photoURL: 'https://example.com/alice.png',
      },
    });

    const { result } = renderHook(() => useCurrentUser());

    expect(result.current).toEqual({
      name: 'Alice Example',
      email: 'alice@corp.com',
      avatar: 'https://example.com/alice.png',
    });
  });
});
