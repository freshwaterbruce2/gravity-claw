import { GoogleGenerativeAI, type FunctionDeclaration } from '@google/generative-ai';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { serve as serveInngest } from 'inngest/hono';
import { inngest } from '@vibetech/inngest-client';
import { allFunctions, setHeartbeatDeps, setToolRefreshDeps } from './inngest-functions.js';
import { fetchAllMcpTools, convertMcpToolsToGeminiDeclarations, executeMcpTool } from './mcp.js';

dotenv.config({ override: true });

// ── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_MODEL = 'gemini-flash-latest';
const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview',
  'gemini-3-pro-preview',
];
const MAX_TOOL_ROUNDS = 10;
const PORT = Number(process.env.GRAVITY_CLAW_PORT ?? 5178);

type GeminiFunctionTool = {
  functionDeclarations: FunctionDeclaration[];
};

const app = new Hono();

// ── 1. Load Soul (Personality) ───────────────────────────────────────────────
const soulPath = path.join(process.cwd(), 'server', 'src', 'soul.md');
let soulContent = 'You are G-CLAW, an advanced autonomous AI agent assistant.';
if (fs.existsSync(soulPath)) {
  soulContent = fs.readFileSync(soulPath, 'utf-8');
  console.log('  🧠 Loaded soul.md personality matrix.');
} else {
  console.log('  ⚠️ soul.md not found, using default personality.');
}

// ── 2. MCP Tools ─────────────────────────────────────────────────────────────
let geminiFunctionTool: GeminiFunctionTool | null = null;
let availableMcpToolsMap: Record<string, { server: string; tool: string }> = {};

async function refreshMcpTools(retries = 0) {
  const MAX_RETRIES = 10;
  const getDelay = (attempt: number) => Math.min(5000 * 2 ** attempt, 30000);

  console.log('  🔄 Fetching MCP Tools from Gateway...');
  let serverTools;
  try {
    serverTools = await fetchAllMcpTools();
  } catch (err: any) {
    if (retries < MAX_RETRIES) {
      const delay = getDelay(retries);
      console.log(`  ⏳ Gateway not ready, retrying in ${delay / 1000}s (${retries + 1}/${MAX_RETRIES})...`);
      setTimeout(() => refreshMcpTools(retries + 1), delay);
      return;
    }
    console.log(`  ⚠️ Gateway unreachable after ${MAX_RETRIES} retries: ${err.message}`);
    return;
  }

  const declarations = convertMcpToolsToGeminiDeclarations(serverTools);

  if (declarations.length > 0) {
    geminiFunctionTool = { functionDeclarations: declarations };
    availableMcpToolsMap = {};
    for (const st of serverTools) {
      for (const t of st.tools) {
        const safeName = `${st.server}_${t.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
        availableMcpToolsMap[safeName] = { server: st.server, tool: t.name };
      }
    }
    console.log(`  ✅ Loaded ${declarations.length} MCP Tools.`);
  } else if (retries < MAX_RETRIES) {
    const delay = getDelay(retries);
    console.log(`  ⏳ No tools yet, retrying in ${delay / 1000}s (${retries + 1}/${MAX_RETRIES})...`);
    setTimeout(() => refreshMcpTools(retries + 1), delay);
  } else {
    geminiFunctionTool = null;
    availableMcpToolsMap = {};
    console.log(`  ⚠️ No MCP Tools found after ${MAX_RETRIES} retries.`);
  }
}

refreshMcpTools();

// Wire up Inngest MCP tools refresh deps
setToolRefreshDeps({ refreshMcpTools });

// ── 3. Gemini Helpers ────────────────────────────────────────────────────────
function getSystemInstruction() {
  return `${soulContent}\n\nYou have capabilities across 34+ skills including file management, web search, and data analysis via MCP Tools. Always prioritize using your tools to answer questions precisely.`;
}

function createModel(genAI: GoogleGenerativeAI, modelId: string = DEFAULT_MODEL) {
  return genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: getSystemInstruction(),
    tools: geminiFunctionTool ? [geminiFunctionTool] : undefined,
  });
}

async function handleFunctionCalls(_model: any, chatSession: any, response: any): Promise<string> {
  let currentResponse = response;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const functionCalls = currentResponse.functionCalls();
    if (!functionCalls || functionCalls.length === 0) {
      return currentResponse.text() || '';
    }

    const functionResponses = await Promise.all(
      functionCalls.map(async (call: any) => {
        console.log(`  🛠️ Executing tool: ${call.name}`);
        const mapping = availableMcpToolsMap[call.name];
        const resultData = mapping
          ? await executeMcpTool(mapping.server, mapping.tool, call.args)
          : { error: `Tool ${call.name} not found.` };

        return {
          functionResponse: {
            name: call.name,
            response: { name: call.name, content: resultData },
          },
        };
      })
    );

    console.log(`  ⬅️ Returning ${functionResponses.length} tool result(s) to model...`);
    currentResponse = (await chatSession.sendMessage(functionResponses)).response;
  }

  return currentResponse.text() || '[Max tool rounds reached]';
}

/** Try the primary model, fall back on 503/overloaded errors */
async function sendWithFallback(
  genAI: GoogleGenerativeAI,
  userMessage: string,
  history: { role: string; parts: { text: string }[] }[] = []
): Promise<string> {
  const modelsToTry = [DEFAULT_MODEL, ...FALLBACK_MODELS];

  for (const modelId of modelsToTry) {
    try {
      const model = createModel(genAI, modelId);
      const chatSession = model.startChat({ history });
      const result = await chatSession.sendMessage(userMessage);
      const reply = await handleFunctionCalls(model, chatSession, result.response);
      if (modelId !== DEFAULT_MODEL) {
        console.log(`  ⚡ Used fallback model: ${modelId}`);
      }
      return reply;
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      const isFetchError = err?.message?.includes('fetch failed') || err?.message?.includes('Error fetching from');
      
      if (status === 503 || status === 429 || status === 500 || isFetchError) {
        console.log(`  ⚠️ ${modelId} unavailable (Status: ${status || 'fetch failed'}), trying next...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('All models unavailable. Try again later.');
}

// ── 4. Telegram Bridge ───────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (TELEGRAM_TOKEN && GEMINI_API_KEY) {
  console.log(`\n  🤖 Initializing Telegram Bridge (${DEFAULT_MODEL})...`);
  const bot = new Telegraf(TELEGRAM_TOKEN, { handlerTimeout: 9_000_000 });
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  bot.on('text', async (ctx) => {
    console.log(`\n  📩 Received message from ${ctx.from?.username || ctx.from?.first_name}: ${ctx.message.text.substring(0, 50)}...`);
    try {
      await ctx.sendChatAction('typing');
      const reply = await sendWithFallback(genAI, ctx.message.text);

      if (reply) {
        // Telegram has a 4096 char limit per message
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

  // Wire up Inngest heartbeat deps (replaces node-cron)
  setHeartbeatDeps({
    sendWithFallback,
    getGenAI: () => genAI,
    getTelegramBot: () => bot,
    getChatId: () => process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',')[0],
  });

  // bot.launch() never resolves (infinite polling loop) — use onLaunch callback
  bot.launch({ dropPendingUpdates: true }, () => {
    console.log('  ✅ Telegram Bridge Online');
    console.log('  ⏱️  Heartbeat scheduled via Inngest (8:00 AM daily).');
  }).catch(err => console.error('  ❌ Telegram Bridge error:', err));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log('\n  ⚠️ Telegram Bridge inactive: Missing TELEGRAM_BOT_TOKEN or GEMINI_API_KEY in .env');
}

// ── 5. HTTP API ──────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: ['http://localhost:5177', 'http://127.0.0.1:5177'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'gravity-claw',
    model: DEFAULT_MODEL,
    tools: geminiFunctionTool?.functionDeclarations.length || 0,
    ts: Date.now(),
  });
});

app.post('/api/refresh-tools', async (c) => {
  await refreshMcpTools();
  return c.json({ status: 'ok', toolCount: geminiFunctionTool?.functionDeclarations.length || 0 });
});

app.post('/api/chat', async (c) => {
  let body: { messages?: { role: string; content: string }[]; model?: string; apiKey?: string; system?: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, model = DEFAULT_MODEL, apiKey, system } = body;
  const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (!resolvedApiKey || typeof resolvedApiKey !== 'string') {
    return c.json({ error: 'Missing or invalid Gemini API key.' }, 401);
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  const genAI = new GoogleGenerativeAI(resolvedApiKey);

  return stream(c, async (writer) => {
    try {
      const generativeModel = genAI.getGenerativeModel({
        model,
        systemInstruction: system ?? soulContent,
        tools: geminiFunctionTool ? [geminiFunctionTool] : undefined,
      });

      const lastMessage = messages[messages.length - 1];
      const history = messages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      const chatSession = generativeModel.startChat({ history });
      const result = await chatSession.sendMessage(lastMessage.content);
      const finalReply = await handleFunctionCalls(generativeModel, chatSession, result.response);

      await writer.write(finalReply);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gemini API error';
      await writer.write(`\n\n[ERROR: ${msg}]`);
    }
  });
});

app.get('/api/models', (c) => {
  return c.json({
    models: [
      { id: 'gemini-flash-latest', label: 'Gemini Flash Latest', provider: 'google' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', provider: 'google' },
    ],
  });
});

// ── 6. Inngest Serve Endpoint ────────────────────────────────────────────────
const inngestHandler = serveInngest({
  client: inngest,
  functions: allFunctions,
});

// Mount Inngest on the existing Hono app (GET for dashboard, PUT for sync, POST for invocations)
app.on(['GET', 'PUT', 'POST'], '/api/inngest', async (c) => inngestHandler(c));

// ── 7. Start Server ──────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n  🦀 gravity-claw proxy running\n  ➜  http://localhost:${PORT}`);
  console.log(`  📡 Inngest endpoint: http://localhost:${PORT}/api/inngest\n`);
});
