import { expect, test, vi } from 'vitest';
import { app } from './app';

vi.mock('./firebase', () => ({
  auth: {
    verifyIdToken: async (token: string) => {
      if (token !== 'valid-token') throw new Error('token rejected');
      return { uid: 'alice' };
    },
  },
}));

// Routes that exist only to exercise the guard; the product routes come later.
app.get('/v1/whoami', (c) => c.json({ uid: c.get('uid') }));
app.get('/v1/boom', () => {
  throw new Error('database password is hunter2');
});

const signedIn = { Authorization: 'Bearer valid-token' };
const unauthenticated = {
  error: { code: 'unauthenticated', message: expect.any(String) },
};

test('GET /health reports ok without a token', async () => {
  const res = await app.request('/health');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});

test.each([
  ['no Authorization header', undefined],
  ['a scheme other than Bearer', 'Basic valid-token'],
  ['an empty bearer token', 'Bearer '],
  ['a token the verifier rejects', 'Bearer forged'],
])('a /v1 route answers 401 with %s', async (_name, authorization) => {
  const res = await app.request('/v1/whoami', {
    headers: authorization ? { Authorization: authorization } : {},
  });

  expect(res.status).toBe(401);
  expect(await res.json()).toEqual(unauthenticated);
});

test('an unknown route is also 401 without a token', async () => {
  const res = await app.request('/v1/nothing-here');

  expect(res.status).toBe(401);
});

test('a valid token reaches the route with the caller uid', async () => {
  const res = await app.request('/v1/whoami', { headers: signedIn });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ uid: 'alice' });
});

test('a valid token on an unknown route gets the 404 envelope', async () => {
  const res = await app.request('/v1/nothing-here', { headers: signedIn });

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({
    error: { code: 'not_found', message: expect.any(String) },
  });
});

test('a thrown error becomes the 500 envelope without internals', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

  const res = await app.request('/v1/boom', { headers: signedIn });
  const body = await res.text();

  expect(res.status).toBe(500);
  expect(JSON.parse(body)).toEqual({
    error: { code: 'internal', message: expect.any(String) },
  });
  expect(body).not.toContain('hunter2');
  expect(logged).toHaveBeenCalled();
  logged.mockRestore();
});

test('preflight from the dashboard origin passes without a token', async () => {
  const res = await app.request('/v1/whoami', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5174',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });

  expect(res.status).toBe(204);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
    'http://localhost:5174',
  );
  expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(
    /authorization/i,
  );
});

test('another origin gets no CORS permission', async () => {
  const res = await app.request('/health', {
    headers: { Origin: 'https://evil.example' },
  });

  expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
});
