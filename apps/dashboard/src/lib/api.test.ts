import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiError } from './api';

vi.mock('./firebase', () => ({
  auth: { currentUser: { getIdToken: async () => 'id-token' } },
}));

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  fetchMock.mockReset();
});

test('sends the ID token to the API base URL and returns the body', async () => {
  fetchMock.mockResolvedValue(json({ id: 'a1' }));

  const result = await api('/v1/analyses', { method: 'POST', body: '{}' });

  const [url, init] = fetchMock.mock.calls[0];
  const headers = new Headers(init?.headers);
  expect(url).toBe('http://api.test/v1/analyses');
  expect(headers.get('Authorization')).toBe('Bearer id-token');
  expect(headers.get('Content-Type')).toBe('application/json');
  expect(result).toEqual({ id: 'a1' });
});

test('an error envelope becomes an ApiError with status and code', async () => {
  fetchMock.mockResolvedValue(
    json({ error: { code: 'unauthenticated', message: 'Sign in.' } }, 401),
  );

  const error = await api('/v1/analyses').catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 401,
    code: 'unauthenticated',
    message: 'Sign in.',
  });
});

test('a failure without an envelope still throws an ApiError', async () => {
  fetchMock.mockResolvedValue(
    new Response('<html>Bad gateway</html>', { status: 502 }),
  );

  const error = await api('/v1/analyses').catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 502, code: 'unknown' });
});
