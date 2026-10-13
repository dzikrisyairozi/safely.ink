import { ErrorEnvelope } from '@repo/api-types';
import { auth } from './firebase';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Calls the API as the signed-in user. Bodies are JSON strings. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Asked for on every call: Firebase refreshes the token when it is about to expire.
  const token = await auth.currentUser?.getIdToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...init,
    headers,
  });
  if (res.ok) return res.json();

  const body = ErrorEnvelope.safeParse(await res.json().catch(() => null));
  throw body.success
    ? new ApiError(res.status, body.data.error.code, body.data.error.message)
    : new ApiError(res.status, 'unknown', res.statusText);
}
