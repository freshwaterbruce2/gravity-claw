import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';

dotenv.config();

const app = new Hono();

// ── Telegram Bridge ───────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (TELEGRAM_TOKEN && ANTHROPIC_API_KEY) {
  console.log(`\n  🤖 Initializing Telegram Bridge...`);
  const bot = new Telegraf(TELEGRAM_TOKEN);
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  bot.on('text', async (ctx) => {
    try {
      const userMessage = ctx.message.text;
      
      // Sending typing action to make it feel alive
      await ctx.sendChatAction('typing');
      
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'You are G-CLAW, an advanced autonomous AI agent assistant. Keep your responses concise, helpful, and agent-like. You have capabilities across 34+ skills including file management, web search, and data analysis.',
        messages: [{ role: 'user', content: userMessage }],
      });

      // Extract the text content from the Anthropic response
      const replyText = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
        
      if (replyText) {
        await ctx.reply(replyText);
      } else {
        await ctx.reply("System: Output generated no text.");
      }
    } catch (err: any) {
      console.error('Telegram Bridge Error:', err);
      await ctx.reply(`[Agent Error]: ${err.message || 'Failed to process request via Anthropic API'}`);
    }
  });

  bot.launch()
    .then(() => console.log('  ✅ Telegram Bridge Online'))
    .catch(err => console.error('  ❌ Failed to launch Telegram Bridge:', err));

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log(`\n  ⚠️ Telegram Bridge inactive: Missing TELEGRAM_BOT_TOKEN or ANTHROPIC_API_KEY in .env`);
}

// ── CORS — only allow local dev frontend ──────────────────────────────────────
app.use(
  '*',
  cors({
    origin: ['http://localhost:5177', 'http://127.0.0.1:5177'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'gravity-claw-proxy', ts: Date.now() });
});

// ── Chat proxy → Anthropic ────────────────────────────────────────────────────
app.post('/api/chat', async (c) => {
  let body: { messages?: unknown[]; model?: string; apiKey?: string; system?: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, model = 'claude-sonnet-4-6', apiKey, system } = body;

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk-ant-')) {
    return c.json({ error: 'Missing or invalid Anthropic API key. Add it in Settings.' }, 401);
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  const client = new Anthropic({ apiKey });

  // Streaming response
  return stream(c, async (writer) => {
    try {
      const response = await client.messages.stream({
        model,
        max_tokens: 4096,
        system:
          system ??
          'You are G-CLAW, an advanced autonomous AI agent assistant. You help users with tasks, answer questions, and demonstrate your capabilities across 34+ skill areas. Be concise, helpful, and a little bit agent-like in tone.',
        messages: messages as Anthropic.MessageParam[],
      });

      for await (const chunk of response) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          await writer.write(chunk.delta.text);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Anthropic API error';
      await writer.write(`\n\n[ERROR: ${msg}]`);
    }
  });
});

// ── Models list ───────────────────────────────────────────────────────────────
app.get('/api/models', (c) => {
  return c.json({
    models: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude Haiku 3.5', provider: 'anthropic' },
    ],
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 5178);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n  🦀 gravity-claw proxy running\n  ➜  http://localhost:${PORT}\n`);
});
