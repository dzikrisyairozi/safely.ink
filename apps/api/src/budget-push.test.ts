import { beforeEach, expect, test, vi } from 'vitest';

const google = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {},
  OAuth2Client: class {
    verifyIdToken = google.verify;
  },
}));

const push = vi.hoisted(() => ({
  BUDGET_PUSH_AUDIENCE: 'https://api.example.com/internal/budget',
  BUDGET_PUSH_SERVICE_ACCOUNT: 'budget-push@example.com',
}));
const setup = vi.hoisted(() => ({ configured: true }));
vi.mock('./config', async (original) => {
  const { config } = await original<typeof import('./config')>();
  return {
    config: new Proxy(config, {
      get: (target, key: string) =>
        key in push
          ? setup.configured
            ? push[key as keyof typeof push]
            : undefined
          : target[key as keyof typeof target],
    }),
  };
});

const firebase = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
}));
vi.mock('./firebase', () => ({
  auth: { verifyIdToken: firebase.verifyIdToken },
  db: { doc: firebase.doc, runTransaction: firebase.runTransaction },
}));

const { app } = await import('./app');
const signedBy = (email: string, verified: unknown = true) => ({
  getPayload: () => ({ email, email_verified: verified }),
});
const post = (
  body: string,
  authorization: string | undefined = 'Bearer token',
) =>
  app.request('/internal/budget', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
    body,
  });

beforeEach(() => {
  vi.clearAllMocks();
  setup.configured = true;
  google.verify.mockResolvedValue(signedBy(push.BUDGET_PUSH_SERVICE_ACCOUNT));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

test('the budget push checks its audience without Firebase authentication', async () => {
  const res = await post('{}');

  expect(res.status).toBe(200);
  expect(google.verify).toHaveBeenCalledWith({
    idToken: 'token',
    audience: push.BUDGET_PUSH_AUDIENCE,
  });
  expect(firebase.verifyIdToken).not.toHaveBeenCalled();
});

test.each([
  ['another account', signedBy('someone@example.com')],
  ['an unverified email', signedBy(push.BUDGET_PUSH_SERVICE_ACCOUNT, false)],
  [
    'a string verification flag',
    signedBy(push.BUDGET_PUSH_SERVICE_ACCOUNT, 'true'),
  ],
  ['no payload', { getPayload: () => undefined }],
])('the push route answers 404 for %s', async (_, ticket) => {
  google.verify.mockResolvedValue(ticket);

  const res = await post('{}');

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({
    error: { code: 'not_found', message: expect.any(String) },
  });
  expect(firebase.doc).not.toHaveBeenCalled();
  expect(firebase.verifyIdToken).not.toHaveBeenCalled();
});

test('an invalid signature, expired token or wrong audience answers 404', async () => {
  google.verify.mockRejectedValue(new Error('Invalid token'));
  expect((await post('{}')).status).toBe(404);
  expect(firebase.doc).not.toHaveBeenCalled();
});

test.each(['', 'Basic token', 'Bearer '])(
  'a missing bearer token (%s) answers 404',
  async (header) => {
    expect((await post('{}', header)).status).toBe(404);
    expect(google.verify).not.toHaveBeenCalled();
  },
);

test('without the settings the push route answers 404', async () => {
  setup.configured = false;
  expect((await post('{}')).status).toBe(404);
  expect(google.verify).not.toHaveBeenCalled();
});

test.each(['GET', 'PUT', 'DELETE'])(
  '%s on the push path answers 404',
  async (method) => {
    expect((await app.request('/internal/budget', { method })).status).toBe(
      404,
    );
    expect(firebase.verifyIdToken).not.toHaveBeenCalled();
  },
);

test.each([
  'not json',
  '{}',
  '{"message":{}}',
  '{"message":{"data":123}}',
  '{"message":{"data":"!not-base64!"}}',
  JSON.stringify({
    message: { data: Buffer.from('not json').toString('base64') },
  }),
  JSON.stringify({ message: { data: Buffer.from('{}').toString('base64') } }),
  JSON.stringify({
    message: {
      data: Buffer.from(
        JSON.stringify({
          costAmount: '100',
          budgetAmount: 100,
          costIntervalStart: '2026-11-01T00:00:00Z',
        }),
      ).toString('base64'),
    },
  }),
  JSON.stringify({
    message: {
      data: Buffer.from(
        JSON.stringify({
          costAmount: 100,
          budgetAmount: 100,
          costIntervalStart: 'not a date',
        }),
      ).toString('base64'),
    },
  }),
])('a malformed push is acknowledged and logged: %s', async (body) => {
  const res = await post(body);

  expect(res.status).toBe(200);
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('malformed budget notification'),
  );
  expect(firebase.doc).not.toHaveBeenCalled();
  expect(firebase.runTransaction).not.toHaveBeenCalled();
});

test('a valid push reaches the transaction and a database failure is retried', async () => {
  firebase.doc.mockReturnValue({ path: 'system/budget' });
  firebase.runTransaction.mockRejectedValue(new Error('Unavailable'));
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = await post(
    JSON.stringify({
      message: {
        data: Buffer.from(
          JSON.stringify({
            costAmount: 100,
            budgetAmount: 100,
            costIntervalStart: '2026-11-01T00:00:00Z',
          }),
        ).toString('base64'),
      },
    }),
  );

  expect(res.status).toBe(500);
  expect(firebase.doc).toHaveBeenCalledWith('system/budget');
  expect(firebase.runTransaction).toHaveBeenCalledOnce();
  logged.mockRestore();
});
