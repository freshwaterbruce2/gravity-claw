/**
 * Gravity-Claw Inngest Functions
 *
 * Replaces node-cron scheduled jobs with durable, retryable Inngest functions:
 *
 *   1. Daily Heartbeat (8 AM) — sends Telegram morning greeting
 *   2. MCP Tools Refresh      — periodically refreshes available tools
 *
 * Benefits over node-cron:
 *   - Automatic retries on failure (Telegram API hiccups)
 *   - Execution history visible in Inngest Dev Server dashboard
 *   - No lost schedules on server restart (Inngest tracks state)
 *   - Step-level checkpointing (greeting generation vs delivery)
 */

import { inngest } from '@vibetech/inngest-client';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Injected at registration time from the main server module */
export interface HeartbeatDeps {
  sendWithFallback: (
    genAI: any,
    userMessage: string,
    history?: { role: string; parts: { text: string }[] }[]
  ) => Promise<string>;
  getGenAI: () => any;
  getTelegramBot: () => any;
  getChatId: () => string | undefined;
}

export interface ToolRefreshDeps {
  refreshMcpTools: () => Promise<void>;
}

// Deps are set once at startup via setDeps()
let heartbeatDeps: HeartbeatDeps | null = null;
let toolRefreshDeps: ToolRefreshDeps | null = null;

export function setHeartbeatDeps(deps: HeartbeatDeps): void {
  heartbeatDeps = deps;
}

export function setToolRefreshDeps(deps: ToolRefreshDeps): void {
  toolRefreshDeps = deps;
}

// ─── 1. Daily Heartbeat (replaces node-cron '0 8 * * *') ─────────────────────

export const dailyHeartbeat = inngest.createFunction(
  {
    id: 'gclaw-daily-heartbeat',
    retries: 3,
  },
  { cron: '0 8 * * *' },
  async ({ step }) => {
    if (!heartbeatDeps) {
      throw new Error('Heartbeat deps not initialized — call setHeartbeatDeps() at startup');
    }

    const { sendWithFallback, getGenAI, getTelegramBot, getChatId } = heartbeatDeps;

    // Step 1: Generate the greeting via Gemini
    const greeting = await step.run('generate-greeting', async () => {
      const genAI = getGenAI();
      if (!genAI) throw new Error('Gemini API not configured');

      const reply = await sendWithFallback(
        genAI,
        'It is 8:00 AM. Send a brief, personalized morning greeting and ask about daily goals. Be concise, use your personality.'
      );
      return reply;
    });

    // Step 2: Send via Telegram
    const result = await step.run('send-telegram', async () => {
      const chatId = getChatId();
      if (!chatId) {
        return { success: false, error: 'TELEGRAM_ALLOWED_USER_IDS not set' };
      }

      const bot = getTelegramBot();
      if (!bot) {
        return { success: false, error: 'Telegram bot not initialized' };
      }

      await bot.telegram.sendMessage(chatId, greeting);
      return { success: true, chatId };
    });

    // Step 3: Emit completion event
    await step.sendEvent('notify-heartbeat-result', {
      name: 'gclaw/heartbeat.completed' as const,
      data: result,
    });

    console.error(`[inngest] Heartbeat ${result.success ? 'sent' : 'skipped'}: ${'error' in result && result.error ? result.error : 'OK'}`);
    return result;
  },
);

// ─── 2. MCP Tools Refresh (every 30 minutes) ─────────────────────────────────

export const mcpToolsRefresh = inngest.createFunction(
  {
    id: 'gclaw-mcp-tools-refresh',
    retries: 2,
  },
  { cron: '*/30 * * * *' },
  async ({ step }) => {
    if (!toolRefreshDeps) {
      throw new Error('Tool refresh deps not initialized — call setToolRefreshDeps() at startup');
    }

    const result = await step.run('refresh-tools', async () => {
      await toolRefreshDeps!.refreshMcpTools();
      return { refreshedAt: new Date().toISOString() };
    });

    console.error(`[inngest] MCP tools refreshed at ${result.refreshedAt}`);
    return result;
  },
);

/** All Inngest functions to register with serve() */
export const allFunctions = [dailyHeartbeat, mcpToolsRefresh];
