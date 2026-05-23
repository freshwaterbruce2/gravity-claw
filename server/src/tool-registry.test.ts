import assert from 'node:assert/strict';
import test from 'node:test';
import { SchemaType } from '@google/generative-ai';
import { createEventBus } from './event-bus.js';
import { state } from './state.js';
import { refreshMcpTools } from './tool-registry.js';
import type { GeminiFunctionTool } from './types-internal.js';

const TEST_APP_CONFIG = {
  name: 'Test',
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

test('refreshMcpTools clears stale tool state after repeated gateway failures', async () => {
  const originalFetch = globalThis.fetch;
  const originalState = {
    availableServerTools: state.availableServerTools,
    geminiFunctionTool: state.geminiFunctionTool,
    availableMcpToolsMap: state.availableMcpToolsMap,
    recentLogs: state.recentLogs,
    eventBus: state.eventBus,
    appConfig: state.appConfig,
  };

  state.availableServerTools = [{ server: 'filesystem', tools: [{ name: 'read_text_file', description: 'read', inputSchema: { type: 'object', properties: {} } }] }];
  state.geminiFunctionTool = {
    functionDeclarations: [
      {
        name: 'filesystem_read_text_file',
        description: 'read',
        parameters: { type: SchemaType.OBJECT, properties: {} },
      },
    ],
  };
  state.availableMcpToolsMap = {
    filesystem_read_text_file: { server: 'filesystem', tool: 'read_text_file' },
  };
  state.recentLogs = [];
  state.eventBus = createEventBus();
  state.appConfig = TEST_APP_CONFIG;

  globalThis.fetch = (async () => {
    throw new Error('gateway down');
  }) as typeof fetch;

  try {
    await refreshMcpTools(10);

    assert.deepEqual(state.availableServerTools, []);
    assert.equal(state.geminiFunctionTool, null);
    assert.deepEqual(state.availableMcpToolsMap, {});
  } finally {
    globalThis.fetch = originalFetch;
    state.availableServerTools = originalState.availableServerTools;
    state.geminiFunctionTool = originalState.geminiFunctionTool;
    state.availableMcpToolsMap = originalState.availableMcpToolsMap;
    state.recentLogs = originalState.recentLogs;
    state.eventBus = originalState.eventBus;
    state.appConfig = originalState.appConfig;
  }
});

test('refreshMcpTools populates tool state on successful gateway fetch', async () => {
  const originalFetch = globalThis.fetch;
  const originalState = {
    availableServerTools: state.availableServerTools,
    geminiFunctionTool: state.geminiFunctionTool,
    availableMcpToolsMap: state.availableMcpToolsMap,
    recentLogs: state.recentLogs,
    eventBus: state.eventBus,
    appConfig: state.appConfig,
  };

  state.availableServerTools = [];
  state.geminiFunctionTool = null;
  state.availableMcpToolsMap = {};
  state.recentLogs = [];
  state.eventBus = createEventBus();
  state.appConfig = TEST_APP_CONFIG;

  globalThis.fetch = (async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url === 'http://localhost:3100/servers') {
      return new Response(JSON.stringify(['filesystem']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost:3100/servers/filesystem/tools') {
      return new Response(
        JSON.stringify({
          tools: [{ name: 'read_text_file', description: 'read a file', inputSchema: { type: 'object', properties: {} } }],
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
    await refreshMcpTools(0);

    assert.equal(state.availableServerTools.length, 1);
    assert.equal(state.availableServerTools[0]?.server, 'filesystem');
    assert.ok(state.geminiFunctionTool);
    assert.equal(
      (state.geminiFunctionTool as GeminiFunctionTool)
        .functionDeclarations.length,
      1,
    );
    assert.equal(state.availableMcpToolsMap['filesystem_read_text_file']?.server, 'filesystem');
  } finally {
    globalThis.fetch = originalFetch;
    state.availableServerTools = originalState.availableServerTools;
    state.geminiFunctionTool = originalState.geminiFunctionTool;
    state.availableMcpToolsMap = originalState.availableMcpToolsMap;
    state.recentLogs = originalState.recentLogs;
    state.eventBus = originalState.eventBus;
    state.appConfig = originalState.appConfig;
  }
});
