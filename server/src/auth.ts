import { createHmac } from 'node:crypto';
import type { Context, Next } from 'hono';

function getApiSecret(): string {
  return process.env.GRAVITY_CLAW_API_SECRET?.trim() ?? '';
}

function getInngestSigningKey(): string {
  return process.env.INNGEST_SIGNING_KEY?.trim() ?? '';
}

function signInngestBody(body: string, signingKey: string, timestamp: string): string {
  const key = signingKey.replace(/signkey-\w+-/, '');
  return createHmac('sha256', key).update(body).update(timestamp).digest('hex');
}

/**
 * Optional bearer-token middleware.
 * If GRAVITY_CLAW_API_SECRET is configured, all requests (except /api/health)
 * must include Authorization: Bearer <secret>.
 * If the secret is not configured, the middleware is a no-op (backward compatible).
 */
export async function optionalAuth(c: Context, next: Next): Promise<Response | void> {
  const apiSecret = getApiSecret();
  if (apiSecret.length === 0) {
    return next();
  }

  const path = new URL(c.req.url).pathname;
  if (path === '/api/health') {
    return next();
  }

  const header = c.req.header('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1] ?? '';

  if (token !== apiSecret) {
    c.header('WWW-Authenticate', 'Bearer');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return next();
}

/**
 * Inngest signature validation middleware.
 * If INNGEST_SIGNING_KEY is configured, requests must include a valid
 * x-inngest-signature header. Otherwise allows all requests.
 */
export async function inngestAuth(c: Context, next: Next): Promise<Response | void> {
  const signingKey = getInngestSigningKey();
  if (signingKey.length === 0) {
    return next();
  }

  const signatureHeader = c.req.header('x-inngest-signature') ?? '';
  const params = new URLSearchParams(signatureHeader);
  const timestamp = params.get('t') ?? '';
  const signature = params.get('s') ?? '';

  if (!timestamp || !signature) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const sigTime = Number.parseInt(timestamp, 10) * 1000;
  if (!Number.isFinite(sigTime) || Date.now() - sigTime > 5 * 60 * 1000) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.text();
  const expected = signInngestBody(body, signingKey, timestamp);

  if (signature !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return next();
}
