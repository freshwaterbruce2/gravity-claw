import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildApiUrl,
  buildSseUrl,
  isDevBypassEnabled,
  resolveApiBase,
} from './runtime';

test('resolveApiBase prefers the desktop runtime bridge', () => {
  const apiBase = resolveApiBase({
    desktopRuntime: {
      apiBase: 'http://127.0.0.1:7777/',
      isDesktop: true,
    },
    env: {
      VITE_GRAVITY_CLAW_API_BASE: 'http://localhost:9999',
    },
  });

  assert.equal(apiBase, 'http://127.0.0.1:7777');
});

test('resolveApiBase falls back to the Vite environment override', () => {
  const apiBase = resolveApiBase({
    env: {
      VITE_GRAVITY_CLAW_API_BASE: 'https://example.test/service/',
    },
  });

  assert.equal(apiBase, 'https://example.test/service');
});

test('buildApiUrl returns relative api paths when no override is present', () => {
  assert.equal(buildApiUrl('/api/config', { env: {} }), '/api/config');
  assert.equal(buildSseUrl('/api/stream', { env: {} }), '/api/stream');
});

test('dev bypass requires both DEV mode and an explicit env flag', () => {
  assert.equal(
    isDevBypassEnabled({
      env: {
        DEV: true,
        VITE_ENABLE_DEV_BYPASS: 'true',
      },
    }),
    true,
  );

  assert.equal(
    isDevBypassEnabled({
      env: {
        DEV: true,
        VITE_ENABLE_DEV_BYPASS: 'false',
      },
    }),
    false,
  );

  assert.equal(
    isDevBypassEnabled({
      env: {
        DEV: false,
        VITE_ENABLE_DEV_BYPASS: 'true',
      },
    }),
    false,
  );
});
