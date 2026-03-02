import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';

const app = new Hono();

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

  const { messages, model = 'claude-sonnet-4-20250514', apiKey, system } = body;

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
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'anthropic' },
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', provider: 'anthropic' },
      { id: 'claude-haiku-3-5-20241022', label: 'Claude Haiku 3.5', provider: 'anthropic' },
    ],
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 5178);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n  🦀 gravity-claw proxy running\n  ➜  http://localhost:${PORT}\n`);
});
