import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { state } from './state.js';

// Setup Mock for child_process using CJS cache mutation before importing openai.js
class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

const require = createRequire(import.meta.url);
const cp = require('child_process');

let spawnedCmd = '';
let spawnedArgs: string[] = [];
let mockChild: MockChildProcess | null = null;

const originalSpawn = cp.spawn;
cp.spawn = (cmd: string, args: string[], _opts: any) => {
  spawnedCmd = cmd;
  spawnedArgs = args;
  mockChild = new MockChildProcess();
  return mockChild;
};

// Import openai.js after mutating child_process
const {
  getCodexToken,
  isOpenAIModel,
  buildOpenAITools,
  handleOpenAIChat,
} = await import('./openai.js');

test('isOpenAIModel matches openai models correctly', () => {
  assert.equal(isOpenAIModel('gpt-4o'), true);
  assert.equal(isOpenAIModel('o1-preview'), true);
  assert.equal(isOpenAIModel('o3-mini'), true);
  assert.equal(isOpenAIModel('openai/custom-model'), true);
  assert.equal(isOpenAIModel('gemini-2.5-flash'), false);
  assert.equal(isOpenAIModel('claude-3-opus'), false);
});

test('getCodexToken retrieves token when auth.json exists', () => {
  const originalProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;

  // Create temporary directory for user profile
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gclaw-test-'));
  fs.mkdirSync(path.join(tempDir, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, '.codex', 'auth.json'),
    JSON.stringify({ tokens: { access_token: 'mocked-codex-token' } }),
    'utf8'
  );

  process.env.USERPROFILE = tempDir;
  process.env.HOME = tempDir;

  try {
    const token = getCodexToken();
    assert.equal(token, 'mocked-codex-token');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env.USERPROFILE = originalProfile;
    process.env.HOME = originalHome;
  }
});

test('getCodexToken returns null when auth.json is missing', () => {
  const originalProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;

  // Point profile to a non-existent temp path
  const nonexistentDir = path.join(os.tmpdir(), 'nonexistent-profile-' + Date.now());
  process.env.USERPROFILE = nonexistentDir;
  process.env.HOME = nonexistentDir;

  try {
    const token = getCodexToken();
    assert.equal(token, null);
  } finally {
    process.env.USERPROFILE = originalProfile;
    process.env.HOME = originalHome;
  }
});

test('getCodexToken returns null on JSON parse errors', () => {
  const originalProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gclaw-test-'));
  fs.mkdirSync(path.join(tempDir, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, '.codex', 'auth.json'), 'invalid-json', 'utf8');

  process.env.USERPROFILE = tempDir;
  process.env.HOME = tempDir;

  const warnSpy = mock.method(console, 'warn', () => {});

  try {
    const token = getCodexToken();
    assert.equal(token, null);
    assert.equal(warnSpy.mock.calls.length, 1);
  } finally {
    warnSpy.mock.restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env.USERPROFILE = originalProfile;
    process.env.HOME = originalHome;
  }
});

test('buildOpenAITools builds OpenAI tool definitions', () => {
  const originalTools = state.availableServerTools;
  const originalConfig = state.appConfig;

  state.availableServerTools = [
    {
      server: 'test-server',
      tools: [
        {
          name: 'get-weather',
          description: 'Get weather conditions',
          inputSchema: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            }
          }
        }
      ]
    }
  ];
  state.appConfig = {
    name: 'G-CLAW-TEST',
    model: 'gpt-4o',
    gravityMechanicEnabled: false,
    memoryEnabled: false,
    beeMemoryEnabled: false,
    selfImprovementEnabled: false,
    vectorMemoryEnabled: false,
    directShellEnabled: false,
    workspaceWatchersEnabled: false,
    gitPipelineEnabled: false,
    oauthLoopholeEmail: '',
    platforms: {
      telegram: false,
      discord: false,
      whatsapp: false,
      slack: false,
      email: false,
      signal: false,
    },
    skillEngine: {
      maxConcurrentSkills: 1,
      skillTimeoutSeconds: 10,
      webSearchMaxResults: 5,
    },
  };

  try {
    const tools = buildOpenAITools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0].type, 'function');
    assert.equal(tools[0].function.name, 'test_server_get_weather');
    assert.equal(tools[0].function.description, 'Get weather conditions');
    assert.deepEqual(tools[0].function.parameters, {
      type: 'object',
      properties: {
        location: { type: 'string' }
      }
    });
  } finally {
    state.availableServerTools = originalTools;
    state.appConfig = originalConfig;
  }
});

test('handleOpenAIChat calls OpenAI API direct endpoint when key is provided', async () => {
  const fetchMock = mock.fn(async (url: string, init?: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, 'gpt-4o');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello from OpenAI mock API'
            }
          }
        ]
      })
    } as unknown as Response;
  });

  const fetchSpy = mock.method(globalThis, 'fetch', fetchMock);
  const logSpy = mock.method(console, 'log', () => {});

  let writtenContent = '';
  const writer = {
    write: async (chunk: string) => {
      writtenContent += chunk;
    }
  };

  try {
    await handleOpenAIChat(
      'mock-api-key',
      'openai/gpt-4o',
      [{ role: 'user', content: 'Hi' }],
      'You are a helpful assistant',
      writer
    );
    assert.equal(writtenContent, 'Hello from OpenAI mock API');
    assert.equal(fetchSpy.mock.calls.length, 1);
  } finally {
    fetchSpy.mock.restore();
    logSpy.mock.restore();
  }
});

test('handleOpenAIChat executes tool calling loop and handles blocked policy', async () => {
  const originalToolsMap = state.availableMcpToolsMap;
  const originalConfig = state.appConfig;

  state.availableMcpToolsMap = {
    'desktop_commander_dc_run_cmd': { server: 'desktop-commander', tool: 'dc_run_cmd' }
  };
  state.appConfig = {
    name: 'G-CLAW-TEST',
    model: 'gpt-4o',
    gravityMechanicEnabled: false,
    memoryEnabled: false,
    beeMemoryEnabled: false,
    selfImprovementEnabled: false,
    vectorMemoryEnabled: false,
    directShellEnabled: false,
    workspaceWatchersEnabled: false,
    gitPipelineEnabled: false,
    oauthLoopholeEmail: '',
    platforms: {
      telegram: false,
      discord: false,
      whatsapp: false,
      slack: false,
      email: false,
      signal: false,
    },
    skillEngine: {
      maxConcurrentSkills: 1,
      skillTimeoutSeconds: 10,
      webSearchMaxResults: 5,
    },
  };

  let callCount = 0;
  const fetchMock = mock.fn(async (_url: string, init?: RequestInit) => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I need to run a command.',
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: {
                      name: 'desktop_commander_dc_run_cmd',
                      arguments: JSON.stringify({ command: 'rm -rf /' })
                    }
                  }
                ]
              }
            }
          ]
        })
      } as unknown as Response;
    } else {
      const body = JSON.parse(init?.body as string);
      const messages = body.messages;
      const lastMsg = messages[messages.length - 1];
      assert.equal(lastMsg.role, 'tool');
      assert.equal(lastMsg.tool_call_id, 'call_123');
      const content = JSON.parse(lastMsg.content);
      assert.equal(content.policyBlocked, true);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Command was blocked by policy.'
              }
            }
          ]
        })
      } as unknown as Response;
    }
  });

  const fetchSpy = mock.method(globalThis, 'fetch', fetchMock);
  const logSpy = mock.method(console, 'log', () => {});

  let writtenContent = '';
  const writer = {
    write: async (chunk: string) => {
      writtenContent += chunk;
    }
  };

  try {
    await handleOpenAIChat(
      'mock-api-key',
      'openai/gpt-4o',
      [{ role: 'user', content: 'Run command' }],
      'System prompt',
      writer
    );
    assert.ok(writtenContent.includes('Command was blocked by policy.'));
    assert.equal(fetchSpy.mock.calls.length, 2);
  } finally {
    fetchSpy.mock.restore();
    logSpy.mock.restore();
    state.availableMcpToolsMap = originalToolsMap;
    state.appConfig = originalConfig;
  }
});

test('handleOpenAIChat spawns Codex CLI when API key is missing', async () => {
  const originalEnv = { ...process.env };
  delete process.env.OPENAI_API_KEY;

  let writtenContent = '';
  const writer = {
    write: async (chunk: string) => {
      writtenContent += chunk;
    }
  };

  try {
    const promise = handleOpenAIChat(
      '',
      'openai/gpt-4o',
      [{ role: 'user', content: 'Codex prompt' }],
      'System prompt',
      writer
    );

    // Wait slightly to let the child process spawn
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(mockChild);
    assert.equal(spawnedCmd, 'codex');
    assert.ok(spawnedArgs.includes('gpt-4o'));

    // Emit streams events
    mockChild.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'content_block.delta',
      delta: { text: 'Hello from ' }
    }) + '\n'));

    mockChild.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Codex CLI!' }
    }) + '\n'));

    mockChild.emit('close', 0);

    await promise;

    assert.ok(writtenContent.includes('Hello from '));
    assert.ok(writtenContent.includes('Codex CLI!'));
  } finally {
    process.env = originalEnv;
  }
});

test.after(() => {
  // Restore original spawn
  cp.spawn = originalSpawn;
});
