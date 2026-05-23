import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { state } from './state.js';
import {
  handleTelegramText,
  isTelegramUserAllowed,
  parseAllowedTelegramUserIds,
  type TelegramHandlerDeps,
  type TelegramTextContext,
} from './telegram.js';

test('parseAllowedTelegramUserIds trims values and ignores invalid entries', () => {
  assert.deepEqual(
    parseAllowedTelegramUserIds(' 12345, not-a-number, -67890, 0, , 42 '),
    [12345, 42],
  );
});

test('parseAllowedTelegramUserIds warns about non-positive integer IDs', (t) => {
  const warnSpy = t.mock.method(console, 'warn');
  parseAllowedTelegramUserIds('12345, -67890, 0, 42');
  const warnings = warnSpy.mock.calls.map((c) => String(c.arguments[0] ?? ''));
  assert.ok(
    warnings.some((w) => w.includes('-67890') && w.includes('0')),
    `expected warning mentioning non-positive IDs, got: ${JSON.stringify(warnings)}`,
  );
});

test('isTelegramUserAllowed denies access when no allowlist is configured', () => {
  assert.equal(isTelegramUserAllowed(12345, []), false);
  assert.equal(isTelegramUserAllowed(undefined, [12345]), false);
});

test('isTelegramUserAllowed only permits configured users', () => {
  const allowedUserIds = parseAllowedTelegramUserIds('12345,67890');

  assert.equal(isTelegramUserAllowed(12345, allowedUserIds), true);
  assert.equal(isTelegramUserAllowed(99999, allowedUserIds), false);
});

test('handleTelegramText rejects unauthorized user with 🚫 log and no bot calls', async (t) => {
  const logSpy = t.mock.method(console, 'log');
  const replies: string[] = [];
  let chatActions = 0;
  let fallbackCalls = 0;

  const ctx: TelegramTextContext = {
    from: { id: 99999, username: 'stranger' },
    message: { text: 'malicious message' },
    sendChatAction: async () => { chatActions++; },
    reply: async (text: string) => { replies.push(text); },
  };
  const deps: TelegramHandlerDeps = {
    allowedUserIds: [12345, 67890],
    genAI: {} as never,
    sendWithFallback: async () => { fallbackCalls++; return 'should not happen'; },
  };

  await handleTelegramText(ctx, deps);

  const logs = logSpy.mock.calls.map((c) => String(c.arguments[0] ?? ''));
  assert.ok(
    logs.some((l) => l.includes('🚫 Rejected message from unauthorized user: 99999')),
    `expected 🚫 rejection log for 99999, got: ${JSON.stringify(logs)}`,
  );
  assert.equal(chatActions, 0, 'should not call sendChatAction for unauthorized user');
  assert.deepEqual(replies, [], 'should not send any replies to unauthorized user');
  assert.equal(fallbackCalls, 0, 'should not invoke LLM for unauthorized user');
});

test('handleTelegramText forwards authorized message to LLM and replies', async (t) => {
  t.mock.method(console, 'log');
  const replies: string[] = [];
  let receivedText = '';
  let chatActions = 0;
  const genAI = { marker: 'real-genai-instance' } as never;

  const ctx: TelegramTextContext = {
    from: { id: 12345, username: 'bruce' },
    message: { text: 'hello agent' },
    sendChatAction: async () => { chatActions++; },
    reply: async (text: string) => { replies.push(text); },
  };
  const deps: TelegramHandlerDeps = {
    allowedUserIds: [12345],
    genAI,
    sendWithFallback: async (ai, text) => {
      assert.equal(ai, genAI, 'should pass genAI through to LLM helper');
      receivedText = text;
      return 'agent response';
    },
  };

  await handleTelegramText(ctx, deps);

  assert.equal(receivedText, 'hello agent');
  assert.equal(chatActions, 1, 'should call sendChatAction for authorized user');
  assert.deepEqual(replies, ['agent response']);
});

test('handleTelegramText sends fallback message when LLM returns no text', async (t) => {
  t.mock.method(console, 'log');
  const replies: string[] = [];

  const ctx: TelegramTextContext = {
    from: { id: 42, username: 'bruce' },
    message: { text: 'anything' },
    sendChatAction: async () => { },
    reply: async (text: string) => { replies.push(text); },
  };
  const deps: TelegramHandlerDeps = {
    allowedUserIds: [42],
    genAI: {} as never,
    sendWithFallback: async () => null,
  };

  await handleTelegramText(ctx, deps);

  assert.deepEqual(replies, ['System: No text generated.']);
});

test('handleTelegramText rate-limits excessive messages from the same user', async (t) => {
  t.mock.method(console, 'log');
  const replies: string[] = [];

  const ctx: TelegramTextContext = {
    from: { id: 42, username: 'bruce' },
    message: { text: 'spam' },
    sendChatAction: async () => { },
    reply: async (text: string) => { replies.push(text); },
  };
  const deps: TelegramHandlerDeps = {
    allowedUserIds: [42],
    genAI: {} as never,
    sendWithFallback: async () => 'ok',
  };

  for (let i = 0; i < 12; i++) {
    await handleTelegramText(ctx, deps);
  }

  const rateLimitReplies = replies.filter((r) => r.includes('too quickly'));
  assert.ok(rateLimitReplies.length >= 1, 'expected at least one rate-limit reply');
});

test('handleTelegramText surfaces LLM errors back to the user', async (t) => {
  t.mock.method(console, 'log');
  t.mock.method(console, 'error');
  const replies: string[] = [];

  const ctx: TelegramTextContext = {
    from: { id: 43, username: 'bruce' },
    message: { text: 'please break' },
    sendChatAction: async () => { },
    reply: async (text: string) => { replies.push(text); },
  };
  const deps: TelegramHandlerDeps = {
    allowedUserIds: [43],
    genAI: {} as never,
    sendWithFallback: async () => { throw new Error('upstream down'); },
  };

  await handleTelegramText(ctx, deps);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /G-CLAW Error.*upstream down/);
});

test('isTelegramUserAllowed rejects negative and zero user IDs', () => {
  assert.equal(isTelegramUserAllowed(-1, [12345]), false);
  assert.equal(isTelegramUserAllowed(0, [12345]), false);
  assert.equal(isTelegramUserAllowed(-999, [12345]), false);
});

test('handleTelegramText handles empty message text', async (t) => {
  t.mock.method(console, 'log');
  const replies: string[] = [];

  const ctx: TelegramTextContext = {
    from: { id: 44, username: 'bruce' },
    message: { text: '' },
    sendChatAction: async () => { },
    reply: async (text: string) => { replies.push(text); },
  };
  const deps: TelegramHandlerDeps = {
    allowedUserIds: [44],
    genAI: {} as never,
    sendWithFallback: async () => 'ack',
  };

  await handleTelegramText(ctx, deps);

  assert.equal(replies.length, 1);
  assert.equal(replies[0], 'ack');
});

test('handleTelegramText chunks replies longer than 4096 characters', async (t) => {
  t.mock.method(console, 'log');
  const replies: string[] = [];

  const ctx: TelegramTextContext = {
    from: { id: 45, username: 'bruce' },
    message: { text: 'long' },
    sendChatAction: async () => { },
    reply: async (text: string) => { replies.push(text); },
  };
  const deps: TelegramHandlerDeps = {
    allowedUserIds: [45],
    genAI: {} as never,
    sendWithFallback: async () => 'a'.repeat(5000),
  };

  await handleTelegramText(ctx, deps);

  assert.equal(replies.length, 2);
  assert.equal(replies[0]?.length, 4096);
  assert.equal(replies[1]?.length, 904);
});

test('handleTelegramText routes to OpenAI when model is an OpenAI model', async (t) => {
  t.mock.method(console, 'log');
  
  const originalModel = state.appConfig.model;
  state.appConfig.model = 'gpt-4o';
  
  const originalEnv = { ...process.env };
  process.env.OPENAI_API_KEY = 'mock-openai-key';

  const replies: string[] = [];
  let chatActions = 0;

  const ctx: TelegramTextContext = {
    from: { id: 12345, username: 'bruce' },
    message: { text: 'hello openai' },
    sendChatAction: async () => { chatActions++; },
    reply: async (text: string) => { replies.push(text); },
  };

  const fetchMock = mock.fn(async (url: string, _init?: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'response from mock openai'
            }
          }
        ]
      })
    } as unknown as Response;
  });

  const fetchSpy = t.mock.method(globalThis, 'fetch', fetchMock);

  const deps: TelegramHandlerDeps = {
    allowedUserIds: [12345],
    genAI: {} as never,
    sendWithFallback: async () => 'should not be called',
  };

  try {
    await handleTelegramText(ctx, deps);
    assert.equal(chatActions, 1);
    assert.deepEqual(replies, ['response from mock openai']);
    assert.equal(fetchSpy.mock.calls.length, 1);
  } finally {
    state.appConfig.model = originalModel;
    process.env = originalEnv;
  }
});
