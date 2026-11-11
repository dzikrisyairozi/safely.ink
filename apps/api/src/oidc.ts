import { OAuth2Client } from 'google-auth-library';

const verifier = new OAuth2Client();

/** A Google-signed bearer token for this audience and service account. */
export async function fromServiceAccount(
  header: string | undefined,
  audience: string | undefined,
  account: string | undefined,
) {
  const token = header?.match(/^Bearer (.+)$/)?.[1];
  if (!audience || !account || !token) return false;
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    return payload?.email === account && payload.email_verified === true;
  } catch {
    return false;
  }
}
