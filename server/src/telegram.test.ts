import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleTelegramText,
  isTelegramUserAllowed,
  parseAllowedTelegramUserIds,
  type TelegramHandlerDeps,
  type TelegramTextContext,
} from './telegram.js';

test('parseAllowedTelegramUserIds trims values and ignores invalid entries', () => {
  assert.deepEqual(
    parseAllowedTelegramUserIds(' 12345, not-a-number, -67890, , 42 '),
    [12345, -67890, 42],
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
  const genAI = { marker: 'real-genai-instance' } as never;

  const ctx: TelegramTextContext = {
    from: { id: 12345, username: 'bruce' },
    message: { text: 'hello agent' },
    sendChatAction: async () => {},
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
  assert.deepEqual(replies, ['agent response']);
});

test('handleTelegramText sends fallback message when LLM returns no text', async (t) => {
  t.mock.method(console, 'log');
  const replies: string[] = [];

  const ctx: TelegramTextContext = {
    from: { id: 42, username: 'bruce' },
    message: { text: 'anything' },
    sendChatAction: async () => {},
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

test('handleTelegramText surfaces LLM errors back to the user', async (t) => {
  t.mock.method(console, 'log');
  t.mock.method(console, 'error');
  const replies: string[] = [];

  const ctx: TelegramTextContext = {
    from: { id: 42, username: 'bruce' },
    message: { text: 'please break' },
    sendChatAction: async () => {},
    reply: async (text: string) => { replies.push(text); },
  };
  const deps: TelegramHandlerDeps = {
    allowedUserIds: [42],
    genAI: {} as never,
    sendWithFallback: async () => { throw new Error('upstream down'); },
  };

  await handleTelegramText(ctx, deps);

  assert.equal(replies.length, 1);
  assert.match(replies[0], /G-CLAW Error.*upstream down/);
});
