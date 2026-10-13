import type { ErrorEnvelope } from '@repo/api-types';

/** Body of every non-2xx response. */
export const failure = (
  code: string,
  message: string,
  resetAt?: string,
): ErrorEnvelope => ({
  error: { code, message, ...(resetAt && { resetAt }) },
});
