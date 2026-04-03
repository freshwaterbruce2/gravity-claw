import { GoogleGenerativeAI, type FunctionDeclaration } from '@google/generative-ai';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { streamSSE } from 'hono/streaming';
import net from 'node:net';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'node:child_process';
import { serve as serveInngest } from 'inngest/hono';
import { inngest } from '@vibetech/inngest-client';
import { filterServerToolsByPolicy, enforceToolPolicy } from './capability-policy.js';
import { getGravityClawConfig, updateGravityClawConfig, type GravityClawConfig } from './config.js';
import { resolveCorsOrigin } from './cors.js';
import { createEventBus } from './event-bus.js';
import { buildIntegrationSnapshot, getTelegramBridgeStatus, setTelegramBridgeStatus } from './integrations.js';
import { fetchMcpHealth, startMcpHealthPoller, type McpServerHealth } from './mcp-health.js';
import { startSystemMetrics, readSystemMetrics, type SystemMetricsData } from './system-metrics.js';
import { allFunctions, setHeartbeatDeps, setToolRefreshDeps } from './inngest-functions.js';
import {
  fetchAllMcpTools,
  convertMcpToolsToGeminiDeclarations,
  executeMcpTool,
  type McpServerWithTools,
} from './mcp.js';
import { collectSkillsSnapshot, type SkillsSnapshot } from './skills.js';
import {
  createTask,
  listTasks,
  replaceTasks,
  summarizeTasks,
  updateTask,
  type TaskInput,
  type TaskPatch,
  type TaskRecord,
} from './tasks.js';

dotenv.config({ override: true });

// ── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODELS = [
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview-customtools',
  'gemini-flash-latest',
];

// Kimi K2.5 uses OpenAI-compatible API
const KIMI_API_BASE = 'https://api.moonshot.ai/v1';
const MAX_TOOL_ROUNDS = 30;
const MAX_HISTORY_CHARS = 3_200_000; // ~800K tokens, leaves headroom for system prompt + response
const MAX_SINGLE_MESSAGE_CHARS = 200_000;
const PREFERRED_PORT = Number(process.env.GRAVITY_CLAW_PORT ?? process.env.PORT ?? 5178);
const PORT_FILE = path.resolve(__dirname, '..', '..', '.server-port');
const MCP_GATEWAY_PORT = 3100;
const WORKSPACE_ROOT = path.resolve(process.cwd(), '..', '..');
const MCP_GATEWAY_ROOT = path.resolve(WORKSPACE_ROOT, 'apps', 'mcp-gateway');
const WINDOWS_PYTHON_LAUNCHER = 'C:\\Windows\\py.exe';

// ── Memory Integration ───────────────────────────────────────────────────────
const MEMORY_HTTP_URL = 'http://localhost:3200';

async function callMemoryTool(name: string, args: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(MEMORY_HTTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      result?: { content?: { type: string; text: string }[] };
    };
    const text = data.result?.content?.[0]?.text;
    return text ?? null;
  } catch {
    return null;
  }
}

let memoryContext = '';

async function refreshMemoryContext(): Promise<void> {
  if (!appConfig.memoryEnabled) {
    memoryContext = '';
    return;
  }

  const [ctx, recent] = await Promise.all([
    callMemoryTool('memory_get_context', {}),
    callMemoryTool('memory_get_recent', { limit: 5, sourceId: 'gravity-claw' }),
  ]);

  const parts: string[] = [];
  if (ctx) parts.push(`## Memory Context\n${ctx}`);
  if (recent) parts.push(`## Recent Exchanges\n${recent}`);
  memoryContext = parts.join('\n\n');

  if (memoryContext) {
    console.log(`  [memory] context injected: ${memoryContext.length} chars`);
  }
}

async function captureExchange(userText: string, agentReply: string): Promise<void> {
  if (!appConfig.memoryEnabled || !appConfig.beeMemoryEnabled) return;

  callMemoryTool('memory_add_episodic', {
    query: userText.slice(0, 500),
    response: agentReply.slice(0, 500),
    sourceId: 'gravity-claw',
  }).catch(() => {});

  if (appConfig.vectorMemoryEnabled) {
    callMemoryTool('memory_add_semantic', {
      text: `User: ${userText.slice(0, 500)}\nAgent: ${agentReply.slice(0, 500)}`,
      category: 'chat-exchange',
    }).catch(() => {});
  }
}

type GeminiFunctionTool = {
  functionDeclarations: FunctionDeclaration[];
};

const app = new Hono();
let mcpGatewayProcess: ReturnType<typeof spawn> | null = null;

function waitForPort(port: number, timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();

    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });

      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });

      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tryConnect, 300);
      });
    };

    tryConnect();
  });
}

async function ensureMcpGateway() {
  const alreadyRunning = await waitForPort(MCP_GATEWAY_PORT, 800);
  if (alreadyRunning) {
    return;
  }

  if (!fs.existsSync(MCP_GATEWAY_ROOT)) {
    console.log('  ⚠️ MCP gateway root not found; continuing without tool gateway.');
    return;
  }

  const gatewayEntry = path.join(MCP_GATEWAY_ROOT, 'src', 'index.ts');
  const nodePath = process.execPath;
  const tsxCli = path.join(WORKSPACE_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const pythonLauncherPath =
    process.platform === 'win32' && fs.existsSync(WINDOWS_PYTHON_LAUNCHER)
      ? WINDOWS_PYTHON_LAUNCHER
      : undefined;

  if (!fs.existsSync(tsxCli)) {
    console.log('  ⚠️ tsx CLI not found; unable to auto-start MCP gateway.');
    return;
  }

  console.log('  🚀 Starting local MCP gateway on port 3100...');
  mcpGatewayProcess = spawn(nodePath, [tsxCli, gatewayEntry], {
    cwd: MCP_GATEWAY_ROOT,
    env: {
      ...process.env,
      MCP_CONFIG_PATH: path.join(WORKSPACE_ROOT, '.mcp.json'),
      MCP_GATEWAY_NODE_PATH:
        process.env.MCP_GATEWAY_NODE_PATH ??
        process.env.GRAVITY_CLAW_NODE_PATH ??
        nodePath,
      ...(pythonLauncherPath
        ? {
            MCP_GATEWAY_PYTHON_PATH:
              process.env.MCP_GATEWAY_PYTHON_PATH ?? pythonLauncherPath,
          }
        : {}),
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  mcpGatewayProcess.once('exit', () => {
    mcpGatewayProcess = null;
  });

  const ready = await waitForPort(MCP_GATEWAY_PORT, 15000);
  if (!ready) {
    console.log('  ⚠️ MCP gateway failed to start on port 3100.');
  } else {
    console.log('  ✅ MCP gateway online at http://localhost:3100');
  }
}

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
let appConfig: GravityClawConfig = await getGravityClawConfig();
const eventBus = createEventBus();
const RECENT_EVENT_LIMIT = 50;
const RECENT_ACTIVITY_LIMIT = 75;

interface LogEntryRecord {
  level: string;
  message: string;
  source: string;
  ts: number;
}

interface AgentActivityRecord {
  type: string;
  tool: string;
  server?: string;
  durationMs: number;
  ts: number;
}

interface DashboardSnapshot {
  ts: number;
  config: GravityClawConfig;
  systemMetrics: SystemMetricsData;
  tasks: {
    items: TaskRecord[];
    summary: Awaited<ReturnType<typeof summarizeTasks>>;
  };
  skills: SkillsSnapshot;
  integrations: ReturnType<typeof buildIntegrationSnapshot>;
  mcpStatus: McpServerHealth[];
  recentActivity: AgentActivityRecord[];
  recentLogs: LogEntryRecord[];
}

let lastMcpHealth: McpServerHealth[] = [];
let lastIntegrationSnapshot = buildIntegrationSnapshot(appConfig, lastMcpHealth, getTelegramBridgeStatus());
const recentLogs: LogEntryRecord[] = [];
const recentActivities: AgentActivityRecord[] = [];

function keepRecent<T>(collection: T[], next: T, limit: number) {
  collection.unshift(next);
  if (collection.length > limit) {
    collection.length = limit;
  }
}

function emitLog(level: string, message: string, source: string) {
  const entry: LogEntryRecord = { level, message, source, ts: Date.now() };
  keepRecent(recentLogs, entry, RECENT_EVENT_LIMIT);
  eventBus.emit('log.entry', entry);
}

function emitAgentActivity(activity: Omit<AgentActivityRecord, 'ts'>) {
  const entry: AgentActivityRecord = { ...activity, ts: Date.now() };
  keepRecent(recentActivities, entry, RECENT_ACTIVITY_LIMIT);
  eventBus.emit('agent.activity', entry);
}

function emitTaskSnapshot(action: string, task?: TaskRecord | null) {
  void (async () => {
    const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
    eventBus.emit('task.update', {
      action,
      task: task ?? null,
      tasks,
      summary,
      ts: Date.now(),
    });
  })().catch(() => {});
}

function emitConfigSnapshot() {
  eventBus.emit('config.update', { ...appConfig, ts: Date.now() });
}

function emitIntegrationSnapshot(mcpStatus: McpServerHealth[] = lastMcpHealth) {
  lastMcpHealth = mcpStatus;
  lastIntegrationSnapshot = buildIntegrationSnapshot(appConfig, mcpStatus, getTelegramBridgeStatus());
  eventBus.emit('integration.status', lastIntegrationSnapshot);
  return lastIntegrationSnapshot;
}

async function buildDashboardSnapshot(): Promise<DashboardSnapshot> {
  const config = await getGravityClawConfig();
  const [systemMetrics, tasks, taskSummary, mcpStatus, skills] = await Promise.all([
    readSystemMetrics(),
    listTasks(),
    summarizeTasks(),
    fetchMcpHealth(),
    collectSkillsSnapshot(config, availableServerTools.length > 0 ? availableServerTools : undefined),
  ]);

  const integrations = buildIntegrationSnapshot(config, mcpStatus, getTelegramBridgeStatus());

  return {
    ts: Date.now(),
    config,
    systemMetrics,
    tasks: {
      items: tasks,
      summary: taskSummary,
    },
    skills,
    integrations,
    mcpStatus,
    recentActivity: [...recentActivities],
    recentLogs: [...recentLogs],
  };
}

let availableServerTools: McpServerWithTools[] = [];

function rebuildMcpToolRegistry() {
  const visibleServerTools = filterServerToolsByPolicy(availableServerTools, appConfig);
  const declarations = convertMcpToolsToGeminiDeclarations(visibleServerTools);

  if (declarations.length === 0) {
    geminiFunctionTool = null;
    availableMcpToolsMap = {};
    return;
  }

  geminiFunctionTool = { functionDeclarations: declarations };
  availableMcpToolsMap = {};

  for (const serverTool of visibleServerTools) {
    for (const tool of serverTool.tools) {
      const safeName = `${serverTool.server}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      availableMcpToolsMap[safeName] = { server: serverTool.server, tool: tool.name };
    }
  }
}

async function refreshMcpTools(retries = 0) {
  const MAX_RETRIES = 10;
  const getDelay = (attempt: number) => Math.min(5000 * 2 ** attempt, 30000);

  console.log('  🔄 Fetching MCP Tools from Gateway...');
  emitLog('info', 'Fetching MCP Tools from Gateway', 'refreshMcpTools');
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

  availableServerTools = serverTools;
  rebuildMcpToolRegistry();
  emitIntegrationSnapshot(lastMcpHealth);

  if (geminiFunctionTool && geminiFunctionTool.functionDeclarations.length > 0) {
    console.log(`  ✅ Loaded ${geminiFunctionTool.functionDeclarations.length} MCP Tools.`);
    emitLog('info', `Loaded ${geminiFunctionTool.functionDeclarations.length} MCP Tools`, 'refreshMcpTools');
  } else if (retries < MAX_RETRIES) {
    const delay = getDelay(retries);
    console.log(`  ⏳ No tools yet, retrying in ${delay / 1000}s (${retries + 1}/${MAX_RETRIES})...`);
    setTimeout(() => refreshMcpTools(retries + 1), delay);
  } else {
    geminiFunctionTool = null;
    availableMcpToolsMap = {};
    console.log(`  ⚠️ No MCP Tools found after ${MAX_RETRIES} retries.`);
    emitLog('warn', `No MCP Tools found after ${MAX_RETRIES} retries`, 'refreshMcpTools');
  }
}

await ensureMcpGateway();
await refreshMcpTools();
if (appConfig.memoryEnabled) {
  refreshMemoryContext().catch(() => {});
  callMemoryTool('memory_set_context', { project: 'gravity-claw', status: 'online' }).catch(() => {});
}
lastMcpHealth = await fetchMcpHealth();
emitConfigSnapshot();
emitIntegrationSnapshot(lastMcpHealth);
eventBus.emit('mcp.status', lastMcpHealth);
eventBus.emit('system.metrics', readSystemMetrics());
emitTaskSnapshot('bootstrap');
startMcpHealthPoller(eventBus, (results) => {
  lastMcpHealth = results;
  emitIntegrationSnapshot(results);
});
startSystemMetrics(eventBus);

// Wire up Inngest MCP tools refresh deps
setToolRefreshDeps({ refreshMcpTools });

// ── 3. Gemini Helpers ────────────────────────────────────────────────────────

/** Gemini 3.1 Pro Preview ignores custom function declarations unless using the -customtools variant */
function resolveModelId(requestedModel: string): string {
  if (requestedModel === 'gemini-3.1-pro-preview' && geminiFunctionTool) {
    return 'gemini-3.1-pro-preview-customtools';
  }
  return requestedModel;
}

function getSystemInstruction() {
  const shellStatus = appConfig.directShellEnabled ? 'enabled' : 'disabled';
  const gitStatus = appConfig.gitPipelineEnabled ? 'enabled' : 'disabled';

  const toolCount = Object.keys(availableMcpToolsMap).length;
  const toolStatus = toolCount > 0
    ? `You have ${toolCount} MCP tools available right now.`
    : `MCP tools are currently loading or unavailable. If tools become available during this conversation, use them.`;

  let instruction = `${soulContent}\n\n${toolStatus} You MUST use tool function calls to execute actions — never output commands for the user to run manually. When the user asks you to do something, call the appropriate tool. Multiple tools can be called in sequence.\n\nRuntime policy:\n- Direct shell execution is currently ${shellStatus}.\n- Native git pipeline is currently ${gitStatus}.\n- If a shell or git command is blocked, explain the policy constraint cleanly and choose the safest local alternative.\n- For ANY actionable request (lint, build, file ops, cleanup, etc.), call your tools directly. Do NOT print code blocks for the user to execute.`;

  if (memoryContext) {
    instruction += `\n\n${memoryContext}`;
  }

  return instruction;
}

function createModel(genAI: GoogleGenerativeAI, modelId: string = DEFAULT_MODEL) {
  return genAI.getGenerativeModel({
    model: resolveModelId(modelId),
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
        emitLog('info', `Executing tool: ${call.name}`, 'handleFunctionCalls');
        const startMs = Date.now();
        const mapping = availableMcpToolsMap[call.name];
        let resultData: unknown;

        if (!mapping) {
          resultData = { error: `Tool ${call.name} not found.` };
        } else {
          const policy = enforceToolPolicy(mapping.server, mapping.tool, call.args ?? {}, appConfig);
          resultData = policy.allowed
            ? await executeMcpTool(mapping.server, mapping.tool, call.args)
            : { error: policy.error, policyBlocked: true };
        }

        emitAgentActivity({
          type: 'tool_call',
          tool: call.name,
          server: mapping?.server,
          durationMs: Date.now() - startMs,
        });

        return {
          functionResponse: {
            name: call.name,
            response: { name: call.name, content: resultData },
          },
        };
      })
    );

    console.log(`  ⬅️ Returning ${functionResponses.length} tool result(s) to model...`);
    emitLog('info', `Returning ${functionResponses.length} tool result(s) to model`, 'handleFunctionCalls');
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
      
      if (status === 400 || status === 404 || status === 503 || status === 429 || status === 500 || isFetchError) {
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
  setTelegramBridgeStatus({
    status: 'configured',
    details: 'Telegram bridge credentials loaded and booting.',
  });
  emitIntegrationSnapshot(lastMcpHealth);

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

  // Catch Telegraf-level errors so they don't crash the process
  bot.catch((err: unknown) => {
    console.error('  ❌ Telegram Bot error (non-fatal):', err instanceof Error ? err.message : err);
    setTelegramBridgeStatus({
      status: 'offline',
      details: 'Telegram bridge reported a runtime error.',
    });
    emitIntegrationSnapshot(lastMcpHealth);
  });

  // bot.launch() never resolves (infinite polling loop) — use onLaunch callback
  bot.launch({ dropPendingUpdates: true }, () => {
    console.log('  ✅ Telegram Bridge Online');
    console.log('  ⏱️  Heartbeat scheduled via Inngest (8:00 AM daily).');
    setTelegramBridgeStatus({
      status: 'online',
      details: 'Telegram bridge is connected and polling.',
    });
    emitIntegrationSnapshot(lastMcpHealth);
  }).catch(err => {
    setTelegramBridgeStatus({
      status: 'offline',
      details: 'Telegram bridge failed to start.',
    });
    emitIntegrationSnapshot(lastMcpHealth);
    console.error('  ❌ Telegram Bridge failed to start (non-fatal):', err.message || err);
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log('\n  ⚠️ Telegram Bridge inactive: Missing TELEGRAM_BOT_TOKEN or GEMINI_API_KEY in .env');
  setTelegramBridgeStatus({
    status: 'disabled',
    details: 'Telegram bridge credentials are missing.',
  });
  emitIntegrationSnapshot(lastMcpHealth);
}

// ── History Trimming ─────────────────────────────────────────────────────────
function trimHistory(messages: { role: string; content: string }[]): { role: string; content: string }[] {
  // Pass 1: truncate any single oversized message
  let trimmed = messages.map(m => ({
    role: m.role,
    content: m.content.length > MAX_SINGLE_MESSAGE_CHARS
      ? m.content.slice(0, MAX_SINGLE_MESSAGE_CHARS) + '\n\n[Message truncated — original was ' + m.content.length + ' chars]'
      : m.content,
  }));

  // Pass 2: drop oldest messages if total exceeds budget, keep at least 4 recent
  const MIN_KEEP = 4;
  let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
  let dropped = 0;

  while (totalChars > MAX_HISTORY_CHARS && trimmed.length > MIN_KEEP) {
    totalChars -= trimmed[0].content.length;
    trimmed = trimmed.slice(1);
    dropped++;
  }

  // Ensure history starts with 'user' role (Gemini requirement)
  while (trimmed.length > 1 && trimmed[0].role !== 'user') {
    totalChars -= trimmed[0].content.length;
    trimmed = trimmed.slice(1);
    dropped++;
  }

  if (dropped > 0) {
    if (appConfig.memoryEnabled && appConfig.beeMemoryEnabled) {
      callMemoryTool('memory_add_semantic', {
        text: `Trimmed ${dropped} message(s) from gravity-claw chat history due to context limits.`,
        category: 'trimmed-history',
      }).catch(() => {});
    }

    trimmed.unshift({
      role: 'user',
      content: `[System: ${dropped} older message(s) were trimmed to stay within context limits. Continue from the most recent context.]`,
    });
  }

  return trimmed;
}

// ── 5. HTTP API ──────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: (origin) => resolveCorsOrigin(origin),
  allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'gravity-claw',
    model: DEFAULT_MODEL,
    tools: geminiFunctionTool?.functionDeclarations.length || 0,
    memoryEnabled: appConfig.memoryEnabled,
    directShellEnabled: appConfig.directShellEnabled,
    gitPipelineEnabled: appConfig.gitPipelineEnabled,
    platforms: appConfig.platforms,
    skillEngine: appConfig.skillEngine,
    ts: Date.now(),
  });
});

app.get('/api/config', async (c) => {
  appConfig = await getGravityClawConfig();
  return c.json(appConfig);
});

app.put('/api/config', async (c) => {
  let body: Partial<GravityClawConfig>;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  appConfig = await updateGravityClawConfig(body);
  rebuildMcpToolRegistry();
  if (appConfig.memoryEnabled) {
    refreshMemoryContext().catch(() => {});
  } else {
    memoryContext = '';
  }
  emitConfigSnapshot();
  emitIntegrationSnapshot(lastMcpHealth);
  return c.json(appConfig);
});

app.get('/api/dashboard', async (c) => {
  const dashboard = await buildDashboardSnapshot();
  return c.json(dashboard);
});

app.get('/api/tasks', async (c) => {
  const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
  return c.json({ tasks, summary });
});

app.post('/api/tasks', async (c) => {
  let body: Partial<TaskInput> & { task?: Partial<TaskRecord> };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const source = body.task ?? body;

  if (
    typeof source.title !== 'string' ||
    typeof source.skill !== 'string' ||
    !source.priority ||
    !['critical', 'high', 'medium', 'low'].includes(source.priority)
  ) {
    return c.json({ error: 'title, skill, and priority are required' }, 400);
  }

  const task = await createTask({
    title: source.title,
    skill: source.skill,
    priority: source.priority,
    status: source.status,
    progress: source.progress,
    description: source.description,
  });

  emitTaskSnapshot('created', task);

  const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
  return c.json({ task, tasks, summary }, 201);
});

app.put('/api/tasks', async (c) => {
  let body: Partial<TaskPatch> & { id?: string; tasks?: TaskRecord[] };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (Array.isArray(body.tasks)) {
    const tasks = await replaceTasks(body.tasks);
    const summary = await summarizeTasks();
    eventBus.emit('task.update', {
      action: 'replaced',
      task: null,
      tasks,
      summary,
      ts: Date.now(),
    });
    return c.json({ tasks, summary });
  }

  if (typeof body.id !== 'string' || body.id.trim() === '') {
    return c.json({ error: 'Task id is required' }, 400);
  }

  const updated = await updateTask(body.id.trim(), {
    title: body.title,
    skill: body.skill,
    priority: body.priority,
    status: body.status,
    progress: body.progress,
    description: body.description,
  });

  if (!updated) {
    return c.json({ error: 'Task not found' }, 404);
  }

  emitTaskSnapshot('updated', updated);

  const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
  return c.json({ task: updated, tasks, summary });
});

app.get('/api/skills', async (c) => {
  const config = await getGravityClawConfig();
  const snapshot = await collectSkillsSnapshot(
    config,
    availableServerTools.length > 0 ? availableServerTools : undefined
  );
  return c.json({
    ...snapshot,
    skills: snapshot.available,
  });
});

app.get('/api/integrations', async (c) => {
  const config = await getGravityClawConfig();
  const mcpStatus = await fetchMcpHealth();
  const snapshot = buildIntegrationSnapshot(config, mcpStatus, getTelegramBridgeStatus());
  return c.json({
    ...snapshot,
    integrations: snapshot.channels,
  });
});

app.post('/api/refresh-tools', async (c) => {
  await refreshMcpTools();
  return c.json({ status: 'ok', toolCount: geminiFunctionTool?.functionDeclarations.length || 0 });
});

function isKimiModel(model: string): boolean {
  return model.startsWith('kimi-');
}

// ── Kimi (OpenAI-compatible) agentic tool calling ───────────────────────────

interface OpenAIToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: string;
  content: string | null;
  reasoning_content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

function buildOpenAITools(): OpenAIToolDef[] {
  const tools: OpenAIToolDef[] = [];
  const visibleServerTools = filterServerToolsByPolicy(availableServerTools, appConfig);

  for (const st of visibleServerTools) {
    for (const tool of st.tools) {
      const safeName = `${st.server}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      tools.push({
        type: 'function',
        function: {
          name: safeName,
          description: tool.description || 'No description.',
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        },
      });
    }
  }
  return tools;
}

async function handleKimiChat(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  writer: { write: (chunk: string) => Promise<unknown> },
): Promise<void> {
  const openaiMessages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user' as string,
      content: m.content,
    })),
  ];

  const tools = buildOpenAITools();
  const hasTools = tools.length > 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reqBody: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      temperature: 1.0,
      max_tokens: 8192,
    };
    if (hasTools) {
      reqBody.tools = tools;
      reqBody.tool_choice = 'auto';
    }

    const res = await fetch(`${KIMI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Kimi API error ${res.status}: ${errBody}`);
    }

    const data = await res.json() as {
      choices?: { message?: OpenAIMessage & { reasoning_content?: string }; finish_reason?: string }[];
    };
    const choice = data.choices?.[0];
    const assistantMsg = choice?.message;

    if (!assistantMsg) {
      await writer.write('(no response)');
      return;
    }

    // If the model wants to call tools
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      // Push the assistant message (with tool_calls) into history
      // Kimi thinking models require reasoning_content to be preserved
      const assistantHistoryMsg: OpenAIMessage = {
        role: 'assistant',
        content: assistantMsg.content ?? '',
        tool_calls: assistantMsg.tool_calls,
      };
      if (assistantMsg.reasoning_content) {
        assistantHistoryMsg.reasoning_content = assistantMsg.reasoning_content;
      }
      openaiMessages.push(assistantHistoryMsg);

      // Stream partial text if the model returned any alongside tool calls
      if (assistantMsg.content) {
        await writer.write(assistantMsg.content + '\n\n');
      }

      // Execute each tool call and add results
      for (const tc of assistantMsg.tool_calls) {
        console.log(`  🛠️ [Kimi] Executing tool: ${tc.function.name}`);
        emitLog('info', `[Kimi] Executing tool: ${tc.function.name}`, 'handleKimiChat');
        const startMs = Date.now();

        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }

        const mapping = availableMcpToolsMap[tc.function.name];
        let resultData: unknown;

        if (!mapping) {
          resultData = { error: `Tool ${tc.function.name} not found.` };
        } else {
          const policy = enforceToolPolicy(mapping.server, mapping.tool, args, appConfig);
          resultData = policy.allowed
            ? await executeMcpTool(mapping.server, mapping.tool, args)
            : { error: policy.error, policyBlocked: true };
        }

        emitAgentActivity({
          type: 'tool_call',
          tool: tc.function.name,
          server: mapping?.server,
          durationMs: Date.now() - startMs,
        });

        openaiMessages.push({
          role: 'tool',
          content: JSON.stringify(resultData),
          tool_call_id: tc.id,
        });
      }

      console.log(`  ⬅️ [Kimi] Returning ${assistantMsg.tool_calls.length} tool result(s) to model...`);
      emitLog('info', `[Kimi] Returning ${assistantMsg.tool_calls.length} tool result(s)`, 'handleKimiChat');
      continue; // Next round — model will process tool results
    }

    // No tool calls — final text response
    const kimiReply = assistantMsg.content || '(no response)';
    captureExchange(messages[messages.length - 1]?.content ?? '', kimiReply).catch(() => {});
    await writer.write(kimiReply);
    return;
  }

  await writer.write('[Max tool rounds reached]');
}

app.post('/api/chat', async (c) => {
  let body: {
    messages?: { role: string; content: string }[];
    model?: string;
    apiKey?: string;
    kimiApiKey?: string;
    system?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, model = appConfig.model ?? DEFAULT_MODEL, apiKey, kimiApiKey, system } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages array is required' }, 400);
  }

  const trimmedMessages = trimHistory(messages);

  // Route to Kimi provider
  if (isKimiModel(model)) {
    const resolvedKimiKey = kimiApiKey || process.env.KIMI_API_KEY;
    if (!resolvedKimiKey || typeof resolvedKimiKey !== 'string') {
      return c.json({ error: 'Missing Kimi API key. Add it in Settings.' }, 401);
    }

    return stream(c, async (writer) => {
      try {
        await handleKimiChat(resolvedKimiKey, model, trimmedMessages, system ?? getSystemInstruction(), writer);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Kimi API error';
        await writer.write(`\n\n[ERROR: ${msg}]`);
      }
    });
  }

  // Default: Google Gemini
  const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (!resolvedApiKey || typeof resolvedApiKey !== 'string') {
    return c.json({ error: 'Missing or invalid Gemini API key.' }, 401);
  }

  const genAI = new GoogleGenerativeAI(resolvedApiKey);

  return stream(c, async (writer) => {
    const resolvedModel = resolveModelId(model);
    // Build fallback list: try resolved first, then alternate variant if it differs
    const fallbacks = new Set([resolvedModel]);
    if (resolvedModel !== model) fallbacks.add(model);
    // If customtools variant, also try the plain model as fallback (API key may lack access)
    if (model.endsWith('-customtools')) fallbacks.add(model.replace('-customtools', ''));
    if (resolvedModel.endsWith('-customtools')) fallbacks.add(resolvedModel.replace('-customtools', ''));
    const modelsToTry = [...fallbacks];

    for (const modelId of modelsToTry) {
      try {
        const generativeModel = genAI.getGenerativeModel({
          model: modelId,
          systemInstruction: system ?? getSystemInstruction(),
          tools: geminiFunctionTool ? [geminiFunctionTool] : undefined,
        });

        const lastMessage = trimmedMessages[trimmedMessages.length - 1];
        const history = trimmedMessages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }));

        const chatSession = generativeModel.startChat({ history });
        const result = await chatSession.sendMessage(lastMessage.content);
        const finalReply = await handleFunctionCalls(generativeModel, chatSession, result.response);

        if (modelId !== resolvedModel) {
          console.log(`  ⚡ Fell back from ${resolvedModel} to ${modelId}`);
        }
        captureExchange(lastMessage.content, finalReply).catch(() => {});
        await writer.write(finalReply);
        return;
      } catch (err: unknown) {
        const status = (err as any)?.status || (err as any)?.response?.status;
        if ((status === 400 || status === 404) && modelId !== modelsToTry[modelsToTry.length - 1]) {
          console.log(`  ⚠️ ${modelId} returned ${status}, trying fallback...`);
          continue;
        }
        const msg = err instanceof Error ? err.message : 'Gemini API error';
        await writer.write(`\n\n[ERROR: ${msg}]`);
        return;
      }
    }
  });
});

app.get('/api/models', (c) => {
  return c.json({
    models: [
      // Google Gemini — current lineup (March 2026)
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', provider: 'google' },
      { id: 'gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro (Tool Use)', provider: 'google' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'google' },
      { id: 'gemini-flash-latest', label: 'Gemini Flash Latest', provider: 'google' },
      // Moonshot Kimi — OpenAI-compatible API
      { id: 'kimi-k2.5', label: 'Kimi K2.5 (1T MoE)', provider: 'moonshot' },
      { id: 'kimi-k2.5-thinking', label: 'Kimi K2.5 Thinking', provider: 'moonshot' },
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

// ── 7. SSE Stream & Live Status ──────────────────────────────────────────────

app.get('/api/stream', (c) => {
  return streamSSE(c, async (sseStream) => {
    // Send snapshot of latest state
    const snapshot = eventBus.getSnapshot();
    if (snapshot.size > 0) {
      await sseStream.writeSSE({
        event: 'snapshot',
        data: JSON.stringify(Object.fromEntries(snapshot)),
        id: String(Date.now()),
      });
    }

    const handler = (event: { kind: string; data: unknown; ts: number }) => {
      sseStream
        .writeSSE({ event: event.kind, data: JSON.stringify(event.data), id: String(event.ts) })
        .catch(() => {});
    };

    eventBus.subscribe(handler);

    // Keep-alive ping every 30s
    const keepAlive = setInterval(() => {
      sseStream.writeSSE({ event: 'ping', data: '', id: String(Date.now()) }).catch(() => {});
    }, 30_000);

    sseStream.onAbort(() => {
      eventBus.unsubscribe(handler);
      clearInterval(keepAlive);
    });

    // Keep stream open indefinitely
    await new Promise(() => {});
  });
});

app.get('/api/mcp/status', (c) => {
  const snapshot = eventBus.getSnapshot();
  return c.json(lastMcpHealth.length > 0 ? lastMcpHealth : snapshot.get('mcp.status') ?? []);
});

// ── 8. Start Server (dynamic port discovery) ────────────────────────────────

function findOpenPort(start: number, maxAttempts = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function tryPort(port: number) {
      const srv = net.createServer();
      srv.once('error', () => {
        attempt++;
        if (attempt >= maxAttempts) {
          reject(new Error(`No open port found in range ${start}-${start + maxAttempts}`));
        } else {
          tryPort(port + 1);
        }
      });
      srv.listen(port, () => srv.close(() => resolve(port)));
    }
    tryPort(start);
  });
}

function writePortFile(port: number) {
  fs.writeFileSync(PORT_FILE, String(port), 'utf8');
}

function cleanupPortFile() {
  try { fs.unlinkSync(PORT_FILE); } catch {}
}

const resolvedPort = await findOpenPort(PREFERRED_PORT);

serve({ fetch: app.fetch, port: resolvedPort }, () => {
  writePortFile(resolvedPort);
  if (resolvedPort !== PREFERRED_PORT) {
    console.log(`\n  🦀 gravity-claw proxy running (port ${PREFERRED_PORT} was busy)`);
  } else {
    console.log(`\n  🦀 gravity-claw proxy running`);
  }
  console.log(`  ➜  http://localhost:${resolvedPort}`);
  console.log(`  📡 Inngest endpoint: http://localhost:${resolvedPort}/api/inngest\n`);
});

function shutdown() {
  cleanupPortFile();
  if (mcpGatewayProcess && !mcpGatewayProcess.killed) {
    mcpGatewayProcess.kill();
    mcpGatewayProcess = null;
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('exit', cleanupPortFile);
