import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream, streamSSE } from 'hono/streaming';
import net from 'node:net';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { serve as serveInngest } from 'inngest/hono';
import { inngest } from '@vibetech/inngest-client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGravityClawConfig, updateGravityClawConfig, type GravityClawConfig } from './config.js';
import { resolveCorsOrigin } from './cors.js';
import { createEventBus } from './event-bus.js';
import { buildIntegrationSnapshot, getTelegramBridgeStatus } from './integrations.js';
import { fetchMcpHealth, startMcpHealthPoller } from './mcp-health.js';
import { startSystemMetrics, readSystemMetrics } from './system-metrics.js';
import { allFunctions, setToolRefreshDeps } from './inngest-functions.js';
import {
  listTasks, summarizeTasks, createTask, removeTask, replaceTasks, updateTask,
  type TaskInput, type TaskPatch, type TaskRecord,
} from './tasks.js';
import { collectSkillsSnapshot } from './skills.js';
import { state } from './state.js';
import { callMemoryTool, refreshMemoryContext, captureExchange } from './memory.js';
import { emitTaskSnapshot, emitConfigSnapshot, emitIntegrationSnapshot, buildDashboardSnapshot } from './emitters.js';
import { rebuildMcpToolRegistry, refreshMcpTools } from './tool-registry.js';
import { ensureMcpGateway, loadSoul } from './gateway.js';
import { DEFAULT_MODEL, getSystemInstruction, handleFunctionCalls, resolveModelId } from './gemini.js';
import { isKimiModel, handleKimiChat } from './kimi.js';
import { trimHistory } from './history.js';
import { initTelegramBridge } from './telegram.js';

dotenv.config({ override: true });

// ── Boot ─────────────────────────────────────────────────────────────────────
const PREFERRED_PORT = (() => {
  const v = Number(process.env.GRAVITY_CLAW_PORT ?? process.env.PORT ?? 5187);
  return Number.isInteger(v) && v > 0 ? v : 5187;
})();
const PORT_FILE = path.resolve(__dirname, '..', '..', '.server-port');

state.appConfig = await getGravityClawConfig();
state.eventBus = createEventBus();

loadSoul();
await ensureMcpGateway();
await refreshMcpTools();

if (state.appConfig.memoryEnabled) {
  refreshMemoryContext().catch((err) => { console.warn('[memory] startup context refresh failed:', err); });
  callMemoryTool('memory_set_context', { project: 'gravity-claw', status: 'online' })
    .catch((err) => { console.warn('[memory] startup set_context failed:', err); });
}

state.lastMcpHealth = await fetchMcpHealth();
emitConfigSnapshot();
emitIntegrationSnapshot(state.lastMcpHealth);
state.eventBus.emit('mcp.status', state.lastMcpHealth);
state.eventBus.emit('system.metrics', readSystemMetrics());
emitTaskSnapshot('bootstrap');
startMcpHealthPoller(state.eventBus, (results) => { state.lastMcpHealth = results; emitIntegrationSnapshot(results); });
startSystemMetrics(state.eventBus);
setToolRefreshDeps({ refreshMcpTools });
initTelegramBridge();

// ── HTTP App ─────────────────────────────────────────────────────────────────
const app = new Hono();
app.use('*', cors({
  origin: (origin) => resolveCorsOrigin(origin),
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/api/health', (c) => c.json({
  status: 'ok', service: 'gravity-claw', name: state.appConfig.name,
  model: state.appConfig.model, tools: state.geminiFunctionTool?.functionDeclarations.length || 0,
  memoryEnabled: state.appConfig.memoryEnabled, directShellEnabled: state.appConfig.directShellEnabled,
  gitPipelineEnabled: state.appConfig.gitPipelineEnabled,
  platforms: state.appConfig.platforms, skillEngine: state.appConfig.skillEngine, ts: Date.now(),
}));

app.get('/api/config', async (c) => {
  state.appConfig = await getGravityClawConfig();
  return c.json(state.appConfig);
});

app.put('/api/config', async (c) => {
  let body: Partial<GravityClawConfig>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  state.appConfig = await updateGravityClawConfig(body);
  rebuildMcpToolRegistry();
  if (state.appConfig.memoryEnabled) {
    refreshMemoryContext().catch((err) => { console.warn('[memory] config-update context refresh failed:', err); });
  } else { state.memoryContext = ''; }
  emitConfigSnapshot();
  emitIntegrationSnapshot(state.lastMcpHealth);
  return c.json(state.appConfig);
});

app.get('/api/dashboard', async (c) => c.json(await buildDashboardSnapshot()));

app.get('/api/tasks', async (c) => {
  const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
  return c.json({ tasks, summary });
});

app.post('/api/tasks', async (c) => {
  let body: Partial<TaskInput> & { task?: Partial<TaskRecord> };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  const source = body.task ?? body;
  if (
    typeof source.title !== 'string' || typeof source.skill !== 'string' ||
    !source.priority || !['critical', 'high', 'medium', 'low'].includes(source.priority)
  ) { return c.json({ error: 'title, skill, and priority are required' }, 400); }
  const task = await createTask({
    title: source.title, skill: source.skill, priority: source.priority,
    status: source.status, progress: source.progress, description: source.description,
  });
  emitTaskSnapshot('created', task);
  const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
  return c.json({ task, tasks, summary }, 201);
});

app.put('/api/tasks', async (c) => {
  let body: Partial<TaskPatch> & { id?: string; tasks?: TaskRecord[] };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  if (Array.isArray(body.tasks)) {
    const tasks = await replaceTasks(body.tasks);
    const summary = await summarizeTasks();
    state.eventBus.emit('task.update', { action: 'replaced', task: null, tasks, summary, ts: Date.now() });
    return c.json({ tasks, summary });
  }
  if (typeof body.id !== 'string' || body.id.trim() === '') {
    return c.json({ error: 'Task id is required' }, 400);
  }
  const updated = await updateTask(body.id.trim(), {
    title: body.title, skill: body.skill, priority: body.priority,
    status: body.status, progress: body.progress, description: body.description,
  });
  if (!updated) return c.json({ error: 'Task not found' }, 404);
  emitTaskSnapshot('updated', updated);
  const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
  return c.json({ task: updated, tasks, summary });
});

app.delete('/api/tasks/:id', async (c) => {
  const taskId = c.req.param('id')?.trim();
  if (!taskId) {
    return c.json({ error: 'Task id is required' }, 400);
  }

  const removed = await removeTask(taskId);
  if (!removed) {
    return c.json({ error: 'Task not found' }, 404);
  }

  emitTaskSnapshot('removed', removed);
  const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
  return c.json({ task: removed, tasks, summary });
});

app.get('/api/skills', async (c) => {
  const config = await getGravityClawConfig();
  const snapshot = await collectSkillsSnapshot(
    config,
    state.availableServerTools.length > 0 ? state.availableServerTools : undefined,
  );
  return c.json({ ...snapshot, skills: snapshot.available });
});

app.get('/api/integrations', async (c) => {
  const config = await getGravityClawConfig();
  const mcpStatus = await fetchMcpHealth();
  const snapshot = buildIntegrationSnapshot(config, mcpStatus, getTelegramBridgeStatus());
  return c.json({ ...snapshot, integrations: snapshot.channels });
});

app.post('/api/refresh-tools', async (c) => {
  await refreshMcpTools();
  return c.json({ status: 'ok', toolCount: state.geminiFunctionTool?.functionDeclarations.length || 0 });
});

app.post('/api/chat', async (c) => {
  let body: {
    messages?: { role: string; content: string }[];
    model?: string; apiKey?: string; kimiApiKey?: string; system?: string;
  };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  const { messages, model = state.appConfig.model ?? DEFAULT_MODEL, apiKey, kimiApiKey, system } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages array is required' }, 400);
  }
  const trimmedMessages = trimHistory(messages);

  if (isKimiModel(model)) {
    const resolvedKimiKey = kimiApiKey || process.env.KIMI_API_KEY;
    if (!resolvedKimiKey || typeof resolvedKimiKey !== 'string') {
      return c.json({ error: 'Missing Kimi API key. Add it in Settings.' }, 401);
    }
    return stream(c, async (writer) => {
      try {
        await handleKimiChat(resolvedKimiKey, model, trimmedMessages, system ?? getSystemInstruction(), writer);
      } catch (err: unknown) {
        await writer.write(`\n\n[ERROR: ${err instanceof Error ? err.message : 'Kimi API error'}]`);
      }
    });
  }

  const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY;
  if (!resolvedApiKey || typeof resolvedApiKey !== 'string') {
    return c.json({ error: 'Missing or invalid Gemini API key.' }, 401);
  }
  const genAI = new GoogleGenerativeAI(resolvedApiKey);

  return stream(c, async (writer) => {
    const resolvedModel = resolveModelId(model);
    const fallbacks = new Set([resolvedModel]);
    if (resolvedModel !== model) fallbacks.add(model);
    if (model.endsWith('-customtools')) fallbacks.add(model.replace('-customtools', ''));
    if (resolvedModel.endsWith('-customtools')) fallbacks.add(resolvedModel.replace('-customtools', ''));
    const modelsToTry = [...fallbacks];

    for (const modelId of modelsToTry) {
      try {
        const generativeModel = genAI.getGenerativeModel({
          model: modelId,
          systemInstruction: system ?? getSystemInstruction(),
          tools: state.geminiFunctionTool ? [state.geminiFunctionTool] : undefined,
        });
        const lastMessage = trimmedMessages[trimmedMessages.length - 1];
        const history = trimmedMessages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }));
        const chatSession = generativeModel.startChat({ history });
        const result = await chatSession.sendMessage(lastMessage.content);
        const finalReply = await handleFunctionCalls(chatSession, result.response);
        if (modelId !== resolvedModel) console.log(`  ⚡ Fell back from ${resolvedModel} to ${modelId}`);
        captureExchange(lastMessage.content, finalReply)
          .catch((err) => { console.warn('[memory] captureExchange failed:', err); });
        await writer.write(finalReply);
        return;
      } catch (err: unknown) {
        const status = (err as any)?.status || (err as any)?.response?.status;
        if ((status === 400 || status === 404) && modelId !== modelsToTry[modelsToTry.length - 1]) {
          console.log(`  ⚠️ ${modelId} returned ${status}, trying fallback...`); continue;
        }
        await writer.write(`\n\n[ERROR: ${err instanceof Error ? err.message : 'Gemini API error'}]`);
        return;
      }
    }
  });
});

app.get('/api/models', (c) => c.json({
  models: [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', provider: 'google' },
    { id: 'gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro (Tool Use)', provider: 'google' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'google' },
    { id: 'gemini-flash-latest', label: 'Gemini Flash Latest', provider: 'google' },
    { id: 'kimi-k2.5', label: 'Kimi K2.5 (1T MoE)', provider: 'moonshot' },
    { id: 'kimi-k2.5-thinking', label: 'Kimi K2.5 Thinking', provider: 'moonshot' },
  ],
}));

// ── Inngest ──────────────────────────────────────────────────────────────────
const inngestHandler = serveInngest({ client: inngest, functions: allFunctions });
app.on(['GET', 'PUT', 'POST'], '/api/inngest', async (c) => inngestHandler(c));

// ── SSE ──────────────────────────────────────────────────────────────────────
app.get('/api/stream', (c) =>
  streamSSE(c, async (sseStream) => {
    const snapshot = state.eventBus.getSnapshot();
    if (snapshot.size > 0) {
      await sseStream.writeSSE({
        event: 'snapshot', data: JSON.stringify(Object.fromEntries(snapshot)), id: String(Date.now()),
      });
    }
    const handler = (event: { kind: string; data: unknown; ts: number }) => {
      sseStream
        .writeSSE({ event: event.kind, data: JSON.stringify(event.data), id: String(event.ts) })
        .catch(() => {});
    };
    state.eventBus.subscribe(handler);
    const keepAlive = setInterval(() => {
      sseStream.writeSSE({ event: 'ping', data: '', id: String(Date.now()) }).catch(() => {});
    }, 30_000);
    sseStream.onAbort(() => { state.eventBus.unsubscribe(handler); clearInterval(keepAlive); });
    await new Promise(() => {});
  }),
);

app.get('/api/mcp/status', (c) => {
  const snapshot = state.eventBus.getSnapshot();
  return c.json(state.lastMcpHealth.length > 0 ? state.lastMcpHealth : snapshot.get('mcp.status') ?? []);
});

// ── Server Start ─────────────────────────────────────────────────────────────
function findOpenPort(start: number, maxAttempts = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function tryPort(port: number) {
      const srv = net.createServer();
      srv.once('error', () => {
        attempt++;
        if (attempt >= maxAttempts) {
          reject(new Error(`No open port found in range ${start}-${start + maxAttempts}`));
        } else { tryPort(port + 1); }
      });
      srv.listen(port, () => srv.close(() => resolve(port)));
    }
    tryPort(start);
  });
}

const resolvedPort = await findOpenPort(PREFERRED_PORT);

serve({ fetch: app.fetch, port: resolvedPort }, () => {
  fs.writeFileSync(PORT_FILE, String(resolvedPort), 'utf8');
  if (resolvedPort !== PREFERRED_PORT) {
    console.log(`\n  🦀 gravity-claw proxy running (port ${PREFERRED_PORT} was busy)`);
  } else { console.log('\n  🦀 gravity-claw proxy running'); }
  console.log(`  ➜  http://localhost:${resolvedPort}`);
  console.log(`  📡 Inngest endpoint: http://localhost:${resolvedPort}/api/inngest\n`);
});

function shutdown() {
  try { fs.unlinkSync(PORT_FILE); } catch {}
  if (state.mcpGatewayProcess && !state.mcpGatewayProcess.killed) {
    state.mcpGatewayProcess.kill();
    state.mcpGatewayProcess = null;
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('exit', () => { try { fs.unlinkSync(PORT_FILE); } catch {} });
