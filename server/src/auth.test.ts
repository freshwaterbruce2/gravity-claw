import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { Hono } from 'hono';
import { optionalAuth, inngestAuth } from './auth.js';

function buildApp() {
  const app = new Hono();
  app.use('*', optionalAuth);
  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/protected', (c) => c.json({ ok: true }));
  return app;
}

test('optionalAuth allows requests when GRAVITY_CLAW_API_SECRET is not set', async () => {
  delete process.env.GRAVITY_CLAW_API_SECRET;
  const app = buildApp();
  const res = await app.request('/api/protected');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('optionalAuth rejects requests without bearer token when secret is set', async () => {
  process.env.GRAVITY_CLAW_API_SECRET = 'test-secret-123';
  const app = buildApp();
  const res = await app.request('/api/protected');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'Unauthorized');
});

test('optionalAuth allows health endpoint even without token', async () => {
  process.env.GRAVITY_CLAW_API_SECRET = 'test-secret-123';
  const app = buildApp();
  const res = await app.request('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('optionalAuth allows requests with valid bearer token', async () => {
  process.env.GRAVITY_CLAW_API_SECRET = 'test-secret-123';
  const app = buildApp();
  const res = await app.request('/api/protected', {
    headers: { Authorization: 'Bearer test-secret-123' },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('optionalAuth rejects requests with invalid bearer token', async () => {
  process.env.GRAVITY_CLAW_API_SECRET = 'test-secret-123';
  const app = buildApp();
  const res = await app.request('/api/protected', {
    headers: { Authorization: 'Bearer wrong-token' },
  });
  assert.equal(res.status, 401);
});

test('inngestAuth allows requests when INNGEST_SIGNING_KEY is not set', async () => {
  delete process.env.INNGEST_SIGNING_KEY;
  const app = new Hono();
  app.on(['GET', 'PUT', 'POST'], '/api/inngest', inngestAuth, (c) => c.json({ ok: true }));
  const res = await app.request('/api/inngest', { method: 'POST', body: '{}' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('inngestAuth rejects requests without signature when key is set', async () => {
  process.env.INNGEST_SIGNING_KEY = 'signkey-test-abc123';
  const app = new Hono();
  app.on(['GET', 'PUT', 'POST'], '/api/inngest', inngestAuth, (c) => c.json({ ok: true }));
  const res = await app.request('/api/inngest', { method: 'POST', body: '{}' });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'Unauthorized');
});

test('inngestAuth rejects requests with invalid signature', async () => {
  process.env.INNGEST_SIGNING_KEY = 'signkey-test-abc123';
  const app = new Hono();
  app.on(['GET', 'PUT', 'POST'], '/api/inngest', inngestAuth, (c) => c.json({ ok: true }));
  const res = await app.request('/api/inngest', {
    method: 'POST',
    body: '{}',
    headers: { 'x-inngest-signature': 't=9999999999&s=invalidsig' },
  });
  assert.equal(res.status, 401);
});

test('inngestAuth allows requests with valid signature', async () => {
  process.env.INNGEST_SIGNING_KEY = 'signkey-test-abc123';
  const app = new Hono();
  app.on(['GET', 'PUT', 'POST'], '/api/inngest', inngestAuth, (c) => c.json({ ok: true }));
  const body = '{"test":true}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const expected = createHmac('sha256', 'abc123').update(body).update(timestamp).digest('hex');
  const res = await app.request('/api/inngest', {
    method: 'POST',
    body,
    headers: { 'x-inngest-signature': `t=${timestamp}&s=${expected}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('inngestAuth rejects expired signature', async () => {
  process.env.INNGEST_SIGNING_KEY = 'signkey-test-abc123';
  const app = new Hono();
  app.on(['GET', 'PUT', 'POST'], '/api/inngest', inngestAuth, (c) => c.json({ ok: true }));
  const body = '{}';
  const timestamp = String(Math.floor((Date.now() - 10 * 60 * 1000) / 1000));
  const expected = createHmac('sha256', 'abc123').update(body).update(timestamp).digest('hex');
  const res = await app.request('/api/inngest', {
    method: 'POST',
    body,
    headers: { 'x-inngest-signature': `t=${timestamp}&s=${expected}` },
  });
  assert.equal(res.status, 401);
});
