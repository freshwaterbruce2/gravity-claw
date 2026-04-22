import assert from 'node:assert/strict';
import test from 'node:test';
import { SchemaType } from '@google/generative-ai';
import { createEventBus } from './event-bus.js';
import { state } from './state.js';
import { refreshMcpTools } from './tool-registry.js';

test('refreshMcpTools clears stale tool state after repeated gateway failures', async () => {
  const originalFetch = globalThis.fetch;
  const originalState = {
    availableServerTools: state.availableServerTools,
    geminiFunctionTool: state.geminiFunctionTool,
    availableMcpToolsMap: state.availableMcpToolsMap,
    recentLogs: state.recentLogs,
    eventBus: state.eventBus,
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
  }
});
