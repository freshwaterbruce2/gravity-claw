import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { setTelegramBridgeStatus } from './integrations.js';
import { setHeartbeatDeps } from './inngest-functions.js';
import { emitIntegrationSnapshot } from './emitters.js';
import { sendWithFallback, DEFAULT_MODEL } from './gemini.js';
import { state } from './state.js';

export function initTelegramBridge(): void {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
    console.log('\n  ⚠️ Telegram Bridge inactive: Missing TELEGRAM_BOT_TOKEN or GEMINI_API_KEY in .env');
    setTelegramBridgeStatus({ status: 'disabled', details: 'Telegram bridge credentials are missing.' });
    emitIntegrationSnapshot(state.lastMcpHealth);
    return;
  }

  console.log(`\n  🤖 Initializing Telegram Bridge (${DEFAULT_MODEL})...`);
  const bot = new Telegraf(TELEGRAM_TOKEN, { handlerTimeout: 9_000_000 });
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  setTelegramBridgeStatus({ status: 'configured', details: 'Telegram bridge credentials loaded and booting.' });
  emitIntegrationSnapshot(state.lastMcpHealth);

  bot.on('text', async (ctx) => {
    const allowedIds = process.env.TELEGRAM_ALLOWED_USER_IDS
      ?.split(',').map(id => parseInt(id.trim(), 10)).filter(Boolean) ?? [];
    if (allowedIds.length > 0 && !allowedIds.includes(ctx.from?.id ?? -1)) {
      console.log(`\n  🚫 Rejected message from unauthorized user: ${ctx.from?.id} (${ctx.from?.username || ctx.from?.first_name})`);
      return;
    }
    const preview = ctx.message.text.substring(0, 50);
    console.log(`\n  📩 Received message from ${ctx.from?.username || ctx.from?.first_name}: ${preview}...`);
    try {
      await ctx.sendChatAction('typing');
      const reply = await sendWithFallback(genAI, ctx.message.text);
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
  });

  setHeartbeatDeps({
    sendWithFallback,
    getGenAI: () => genAI,
    getTelegramBot: () => bot,
    getChatId: () => process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',')[0],
  });

  bot.catch((err: unknown) => {
    console.error('  ❌ Telegram Bot error (non-fatal):', err instanceof Error ? err.message : err);
    setTelegramBridgeStatus({ status: 'offline', details: 'Telegram bridge reported a runtime error.' });
    emitIntegrationSnapshot(state.lastMcpHealth);
  });

  bot.launch({ dropPendingUpdates: true }, () => {
    console.log('  ✅ Telegram Bridge Online');
    console.log('  ⏱️  Heartbeat scheduled via Inngest (8:00 AM daily).');
    setTelegramBridgeStatus({ status: 'online', details: 'Telegram bridge is connected and polling.' });
    emitIntegrationSnapshot(state.lastMcpHealth);
  }).catch(err => {
    setTelegramBridgeStatus({ status: 'offline', details: 'Telegram bridge failed to start.' });
    emitIntegrationSnapshot(state.lastMcpHealth);
    console.error('  ❌ Telegram Bridge failed to start (non-fatal):', err.message || err);
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
