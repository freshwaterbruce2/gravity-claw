import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { closeDb, getDb, initDb } from './db.js';
import { callMemoryTool, refreshMemoryContext, scrubPII } from './memory.js';
import { callLocalMemoryTool } from './memory/local-vector.js';
import { state } from './state.js';

function cleanupSource(sourceId: string): void {
  const db = getDb();
  if (!db) return;
  db.prepare('DELETE FROM memory_vectors WHERE source_id = ?').run(sourceId);
}

function withLocalDb() {
  closeDb();
  initDb();
  const db = getDb();
  assert.ok(db, 'memory DB should be initialized for local-vector tests');
  return db;
}

function resetAppMemoryConfig() {
  state.appConfig.memoryEnabled = true;
  state.appConfig.vectorMemoryEnabled = false;
  state.appConfig.beeMemoryEnabled = true;
}

test('scrubPII redacts OpenAI-style API keys', () => {
  const input = 'My key is sk-abc123def456ghi789jkl012mno345pqr678';
  const result = scrubPII(input);
  assert.equal(result, 'My key is [REDACTED]');
});

test('scrubPII redacts long hex strings', () => {
  const input = 'Token: a1b2c3d4e5f6789012345678abcdef1234567890abcdef1234567890abcd';
  const result = scrubPII(input);
  assert.equal(result, 'Token: [REDACTED]');
});

test('scrubPII redacts email addresses', () => {
  const input = 'Contact me at user@example.com please';
  const result = scrubPII(input);
  assert.equal(result, 'Contact me at [REDACTED] please');
});

test('scrubPII redacts phone numbers', () => {
  const input = 'Call me at 555-123-4567 or 555.987.6543';
  const result = scrubPII(input);
  assert.equal(result, 'Call me at [REDACTED] or [REDACTED]');
});

test('scrubPII redacts credit card numbers', () => {
  const input = 'Card: 4111 1111 1111 1111';
  const result = scrubPII(input);
  assert.equal(result, 'Card: [REDACTED]');
});

test('scrubPII redacts URLs with credentials', () => {
  const input = 'Repo: https://user:pass@github.com/org/repo.git';
  const result = scrubPII(input);
  assert.equal(result, 'Repo: [REDACTED]');
});

test('scrubPII handles multiple PII types in one string', () => {
  const input =
    'Email: alice@test.com, Key: sk-12345678901234567890, Phone: 800-555-0199';
  const result = scrubPII(input);
  assert.equal(
    result,
    'Email: [REDACTED], Key: [REDACTED], Phone: [REDACTED]',
  );
});

test('scrubPII leaves clean text unchanged', () => {
  const input = 'Hello, how can I help you today?';
  const result = scrubPII(input);
  assert.equal(result, input);
});

test('local vector tools can persist and retrieve semantic context', async () => {
  const sourceId = 'test-vector-memory-context';
  const db = withLocalDb();
  cleanupSource(sourceId);

  await callLocalMemoryTool('memory_set_context', { sourceId, project: sourceId, status: 'online' });
  await callLocalMemoryTool('memory_add_semantic', {
    sourceId,
    text: 'Persistent vector memory stores architecture decisions and implementation rationale.',
    category: 'notes',
  });
  await callLocalMemoryTool('memory_add_episodic', {
    sourceId,
    query: 'How do we persist recurring decisions?',
    response: 'Use local sqlite vectors and retrieve by semantic similarity.',
  });

  const context = await callLocalMemoryTool('memory_get_context', { sourceId });
  assert.ok(context?.includes('context:online'));

  const recent = await callLocalMemoryTool('memory_get_recent', { sourceId, limit: 10 });
  assert.ok(recent?.includes('notes') || recent?.includes('episodic'));

  const search = await callLocalMemoryTool('memory_search_unified', {
    sourceId,
    query: 'persistent vector architecture',
    limit: 5,
  });
  assert.ok(search?.includes('Persistent vector memory stores architecture decisions'));

  cleanupSource(sourceId);
  closeDb();
});

test('memory call adapter prefers local tools when vector memory is enabled', async () => {
  const sourceId = 'test-vector-adapter-prefer-local';
  withLocalDb();
  cleanupSource(sourceId);

  state.appConfig.memoryEnabled = true;
  state.appConfig.vectorMemoryEnabled = true;
  await callLocalMemoryTool('memory_add_semantic', {
    sourceId,
    text: 'Use local sqlite vectors when vector memory is enabled.',
    category: 'notes',
  });

  const fetchSpy = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Remote memory service should not be called when local vector tool is available');
  });

  const result = await callMemoryTool('memory_search_unified', {
    sourceId,
    query: 'local sqlite vectors',
    limit: 5,
  });

  assert.equal(fetchSpy.mock.calls.length, 0);
  assert.ok(result?.includes('local sqlite vectors'));

  cleanupSource(sourceId);
  fetchSpy.mock.restore();
  closeDb();
});

test('refreshMemoryContext uses local context when vector memory is enabled', async () => {
  const sourceId = 'gravity-claw';
  withLocalDb();
  cleanupSource(sourceId);

  state.appConfig.memoryEnabled = true;
  state.appConfig.vectorMemoryEnabled = true;
  await callLocalMemoryTool('memory_set_context', {
    sourceId,
    status: 'online',
  });

  await callLocalMemoryTool('memory_add_semantic', {
    sourceId,
    text: 'Context refresh should read local memory when vector mode is enabled.',
  });

  const fetchSpy = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Remote memory service should not be used when local memory is enabled');
  });

  await refreshMemoryContext();

  assert.equal(fetchSpy.mock.calls.length, 0);
  assert.ok(state.memoryContext.includes('Context refresh should read local memory'));

  cleanupSource(sourceId);
  fetchSpy.mock.restore();
  closeDb();
});

test('memory tool call falls back to remote tool service when vector mode is disabled', async () => {
  resetAppMemoryConfig();
  const fetchMock = mock.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      return {
        result: {
          content: [{ type: 'text', text: 'remote-memory-result' }],
        },
      };
    },
  }) as unknown as Response);

  const fetchSpy = mock.method(globalThis, 'fetch', fetchMock);
  const result = await callMemoryTool('memory_get_context', { sourceId: 'missing-source' });

  assert.equal(fetchSpy.mock.calls.length, 1);
  assert.equal(result, 'remote-memory-result');
  fetchSpy.mock.restore();
});

test('refreshMemoryContext clears context when memory is disabled', async () => {
  state.memoryContext = 'stale-memory';
  state.appConfig.memoryEnabled = false;
  await refreshMemoryContext();
  assert.equal(state.memoryContext, '');
  state.appConfig.vectorMemoryEnabled = true;
  resetAppMemoryConfig();
});
