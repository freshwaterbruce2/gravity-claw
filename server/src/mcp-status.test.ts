import assert from 'node:assert/strict';
import test from 'node:test';
import type { GravityClawConfig } from './config.js';
import { buildIntegrationSnapshot } from './integrations.js';
import { fetchMcpHealth } from './mcp-health.js';

const TEST_CONFIG: GravityClawConfig = {
  name: 'G-CLAW-01',
  model: 'gemini-2.5-flash',
  gravityMechanicEnabled: true,
  memoryEnabled: true,
  beeMemoryEnabled: true,
  selfImprovementEnabled: true,
  vectorMemoryEnabled: false,
  directShellEnabled: true,
  workspaceWatchersEnabled: false,
  gitPipelineEnabled: true,
  oauthLoopholeEmail: 'test@example.com',
  platforms: {
    telegram: true,
    discord: true,
    whatsapp: true,
    slack: false,
    email: true,
    signal: false,
  },
  skillEngine: {
    maxConcurrentSkills: 3,
    skillTimeoutSeconds: 60,
    webSearchMaxResults: 10,
  },
};

test('fetchMcpHealth reads gateway server payloads shaped as { servers: [...] }', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url === 'http://localhost:3100/servers') {
      return new Response(JSON.stringify({ servers: ['filesystem'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3100/servers/filesystem/tools') {
      return new Response(
        JSON.stringify({
          server: 'filesystem',
          tools: [{ name: 'read_text_file' }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    throw new Error(`Unexpected URL in test: ${url}`);
  }) as typeof fetch;

  try {
    const results = await fetchMcpHealth();

    assert.equal(results.length, 1);
    assert.equal(results[0]?.server, 'filesystem');
    assert.equal(results[0]?.status, 'online');
    assert.equal(results[0]?.toolCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildIntegrationSnapshot marks the MCP gateway degraded when some servers are offline', () => {
  const snapshot = buildIntegrationSnapshot(
    TEST_CONFIG,
    [
      {
        server: 'filesystem',
        status: 'online',
        toolCount: 12,
        latencyMs: 40,
        lastChecked: 1,
      },
      {
        server: 'desktop-commander',
        status: 'offline',
        toolCount: 0,
        latencyMs: 120,
        lastChecked: 1,
      },
    ],
    {
      status: 'online',
      details: 'Telegram bridge is connected and polling.',
      lastChecked: 1,
    }
  );

  const gateway = snapshot.channels.find((channel) => channel.id === 'mcp-gateway');

  assert.equal(gateway?.status, 'degraded');
  assert.match(gateway?.details ?? '', /1 offline/i);
});
