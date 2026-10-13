import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ErrorEnvelope } from '@repo/api-types';
import { config } from './config';
import { auth } from './firebase';

const failure = (code: string, message: string): ErrorEnvelope => ({
  error: { code, message },
});

const unauthenticated = failure(
  'unauthenticated',
  'A valid Firebase ID token is required.',
);

export const app = new Hono<{ Variables: { uid: string } }>();

app.use(
  cors({
    origin: config.ALLOWED_ORIGIN,
    allowHeaders: ['Authorization', 'Content-Type'],
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

// Everything registered below this line needs a signed-in caller.
app.use(async (c, next) => {
  const token = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return c.json(unauthenticated, 401);

  try {
    c.set('uid', (await auth.verifyIdToken(token)).uid);
  } catch {
    return c.json(unauthenticated, 401);
  }
  await next();
});

app.notFound((c) => c.json(failure('not_found', 'No such route.'), 404));

app.onError((err, c) => {
  console.error(err);
  return c.json(failure('internal', 'Something went wrong.'), 500);
});
