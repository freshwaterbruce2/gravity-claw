import { createRequire } from 'node:module';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { setTelegramBridgeStatus } from './integrations.js';
import { setHeartbeatDeps } from './inngest-functions.js';
import { emitIntegrationSnapshot } from './emitters.js';
import { sendWithFallback, DEFAULT_MODEL } from './gemini.js';
import { state } from './state.js';

const requireModule = createRequire(import.meta.url);

export function parseAllowedTelegramUserIds(
  rawValue = process.env.TELEGRAM_ALLOWED_USER_IDS,
): number[] {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }

  const ids = rawValue
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value): value is number => Number.isInteger(value) && value > 0);

  return [...new Set(ids)];
}

export function isTelegramUserAllowed(
  userId: number | undefined,
  allowedUserIds: number[],
): boolean {
  return typeof userId === 'number' && allowedUserIds.includes(userId);
}

export interface TelegramTextContext {
  from?: { id?: number; username?: string; first_name?: string };
  message: { text: string };
  sendChatAction: (action: 'typing') => Promise<unknown>;
  reply: (text: string) => Promise<unknown>;
}

export interface TelegramBotLike {
  telegram: {
    sendMessage: (chatId: string, text: string) => Promise<unknown>;
  };
  on: (event: 'text', handler: (ctx: TelegramTextContext) => Promise<void>) => void;
  catch: (handler: (err: unknown) => void) => void;
  launch: (options: { dropPendingUpdates: boolean }, onLaunch: () => void) => Promise<void>;
  stop: (reason: 'SIGINT' | 'SIGTERM') => void;
}

interface TelegrafModule {
  Telegraf: new (token: string, options: { handlerTimeout: number }) => TelegramBotLike;
}

type TelegrafLoadResult =
  | { ok: true; Telegraf: TelegrafModule['Telegraf'] }
  | { ok: false; details: string };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 10;
const userRateLimits = new Map<number, number[]>();

function isRateLimited(userId: number): boolean {
  const now = Date.now();
  const timestamps = userRateLimits.get(userId) ?? [];
  const withinWindow = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  userRateLimits.set(userId, withinWindow);
  if (withinWindow.length >= RATE_LIMIT_MAX_PER_WINDOW) {
    return true;
  }
  withinWindow.push(now);
  return false;
}

export interface TelegramHandlerDeps {
  allowedUserIds: number[];
  genAI: GoogleGenerativeAI;
  sendWithFallback: (genAI: GoogleGenerativeAI, text: string) => Promise<string | null | undefined>;
}

export async function handleTelegramText(
  ctx: TelegramTextContext,
  deps: TelegramHandlerDeps,
): Promise<void> {
  const userId = ctx.from?.id;
  if (!isTelegramUserAllowed(userId, deps.allowedUserIds)) {
    console.log(
      `\n  🚫 Rejected message from unauthorized user: ${userId} (${ctx.from?.username || ctx.from?.first_name})`,
    );
    return;
  }
  if (userId !== undefined && isRateLimited(userId)) {
    console.log(`\n  🚫 Rate limited user ${userId}`);
    await ctx.reply('You are sending messages too quickly. Please wait a moment.');
    return;
  }
  const preview = ctx.message.text.substring(0, 50);
  console.log(
    `\n  📩 Received message from ${ctx.from?.username || ctx.from?.first_name}: ${preview}...`,
  );
  try {
    await ctx.sendChatAction('typing');
    const reply = await deps.sendWithFallback(deps.genAI, ctx.message.text);
    if (reply) {
      if (reply.length > 4096) {
        for (let i = 0; i < reply.length; i += 4096) {
          await ctx.reply(reply.slice(i, i + 4096));
        }
      } else {
        await ctx.reply(reply);
      }
    } else {
      await ctx.reply('System: No text generated.');
    }
    console.log('  ✅ Replied successfully.');
  } catch (err: any) {
    console.error('  ❌ Telegram error:', err.message || err);
    await ctx.reply(`[G-CLAW Error]: ${err.message || 'Request failed'}`);
  }
}

function describeDependencyLoadError(err: unknown): string {
  if (err instanceof Error) {
    const code = 'code' in err ? String(err.code) : 'unknown';
    return `${code}: ${err.message}`;
  }

  return String(err);
}

function loadTelegraf(): TelegrafLoadResult {
  try {
    const telegrafModule = requireModule('telegraf') as TelegrafModule;
    if (typeof telegrafModule.Telegraf !== 'function') {
      return { ok: false, details: 'telegraf module loaded without a Telegraf export.' };
    }

    return { ok: true, Telegraf: telegrafModule.Telegraf };
  } catch (err: unknown) {
    return { ok: false, details: describeDependencyLoadError(err) };
  }
}

export function initTelegramBridge(): void {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const allowedUserIds = parseAllowedTelegramUserIds();

  if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
    console.log(
      '\n  ⚠️ Telegram Bridge inactive: Missing TELEGRAM_BOT_TOKEN or GEMINI_API_KEY in .env',
    );
    setTelegramBridgeStatus({
      status: 'disabled',
      details: 'Telegram bridge credentials are missing.',
    });
    emitIntegrationSnapshot(state.lastMcpHealth);
    return;
  }

  if (allowedUserIds.length === 0) {
    console.log(
      '\n  ⚠️ Telegram Bridge inactive: TELEGRAM_ALLOWED_USER_IDS is required for access control.',
    );
    setTelegramBridgeStatus({
      status: 'disabled',
      details: 'Telegram bridge access control is not configured.',
    });
    emitIntegrationSnapshot(state.lastMcpHealth);
    return;
  }

  const telegrafLoad = loadTelegraf();
  if (!telegrafLoad.ok) {
    console.log(
      `\n  ⚠️ Telegram Bridge inactive: telegraf could not be loaded (${telegrafLoad.details}).`,
    );
    setTelegramBridgeStatus({
      status: 'disabled',
      details: `Telegram bridge dependency is unavailable: ${telegrafLoad.details}`,
    });
    emitIntegrationSnapshot(state.lastMcpHealth);
    return;
  }

  console.log(`\n  🤖 Initializing Telegram Bridge (${DEFAULT_MODEL})...`);
  const bot = new telegrafLoad.Telegraf(TELEGRAM_TOKEN, { handlerTimeout: 9_000_000 });
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  setTelegramBridgeStatus({
    status: 'configured',
    details: 'Telegram bridge credentials loaded and booting.',
  });
  emitIntegrationSnapshot(state.lastMcpHealth);

  bot.on('text', (ctx) => handleTelegramText(ctx, { allowedUserIds, genAI, sendWithFallback }));

  setHeartbeatDeps({
    sendWithFallback,
    getGenAI: () => genAI,
    getTelegramBot: () => bot,
    getChatId: () => String(allowedUserIds[0]),
  });

  bot.catch((err: unknown) => {
    console.error('  ❌ Telegram Bot error (non-fatal):', err instanceof Error ? err.message : err);
    setTelegramBridgeStatus({
      status: 'offline',
      details: 'Telegram bridge reported a runtime error.',
    });
    emitIntegrationSnapshot(state.lastMcpHealth);
  });

  bot
    .launch({ dropPendingUpdates: true }, () => {
      console.log('  ✅ Telegram Bridge Online');
      console.log('  ⏱️  Heartbeat scheduled via Inngest (8:00 AM daily).');
      setTelegramBridgeStatus({
        status: 'online',
        details: 'Telegram bridge is connected and polling.',
      });
      emitIntegrationSnapshot(state.lastMcpHealth);
    })
    .catch((err: unknown) => {
      setTelegramBridgeStatus({ status: 'offline', details: 'Telegram bridge failed to start.' });
      emitIntegrationSnapshot(state.lastMcpHealth);
      console.error(
        '  ❌ Telegram Bridge failed to start (non-fatal):',
        err instanceof Error ? err.message : err,
      );
    });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
