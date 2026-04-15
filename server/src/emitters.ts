import { state, RECENT_EVENT_LIMIT, RECENT_ACTIVITY_LIMIT } from './state.js';
import { buildIntegrationSnapshot, getTelegramBridgeStatus } from './integrations.js';
import { listTasks, summarizeTasks, type TaskRecord } from './tasks.js';
import { collectSkillsSnapshot } from './skills.js';
import { fetchMcpHealth } from './mcp-health.js';
import { readSystemMetrics } from './system-metrics.js';
import { getGravityClawConfig } from './config.js';
import type { LogEntryRecord, AgentActivityRecord, DashboardSnapshot } from './types-internal.js';
import type { McpServerHealth } from './mcp-health.js';

export function keepRecent<T>(collection: T[], next: T, limit: number) {
  collection.unshift(next);
  if (collection.length > limit) collection.length = limit;
}

export function emitLog(level: string, message: string, source: string) {
  const entry: LogEntryRecord = { level, message, source, ts: Date.now() };
  keepRecent(state.recentLogs, entry, RECENT_EVENT_LIMIT);
  state.eventBus.emit('log.entry', entry);
}

export function emitAgentActivity(activity: Omit<AgentActivityRecord, 'ts'>) {
  const entry: AgentActivityRecord = { ...activity, ts: Date.now() };
  keepRecent(state.recentActivities, entry, RECENT_ACTIVITY_LIMIT);
  state.eventBus.emit('agent.activity', entry);
}

export function emitTaskSnapshot(action: string, task?: TaskRecord | null) {
  void (async () => {
    const [tasks, summary] = await Promise.all([listTasks(), summarizeTasks()]);
    state.eventBus.emit('task.update', { action, task: task ?? null, tasks, summary, ts: Date.now() });
  })().catch((err) => { console.warn('[tasks] failed to emit task snapshot:', err); });
}

export function emitConfigSnapshot() {
  state.eventBus.emit('config.update', { ...state.appConfig, ts: Date.now() });
}

export function emitIntegrationSnapshot(mcpStatus: McpServerHealth[] = state.lastMcpHealth) {
  state.lastMcpHealth = mcpStatus;
  const snap = buildIntegrationSnapshot(state.appConfig, mcpStatus, getTelegramBridgeStatus());
  state.eventBus.emit('integration.status', snap);
  return snap;
}

export async function buildDashboardSnapshot(): Promise<DashboardSnapshot> {
  const config = await getGravityClawConfig();
  const [systemMetrics, tasks, taskSummary, mcpStatus, skills] = await Promise.all([
    readSystemMetrics(),
    listTasks(),
    summarizeTasks(),
    fetchMcpHealth(),
    collectSkillsSnapshot(
      config,
      state.availableServerTools.length > 0 ? state.availableServerTools : undefined,
    ),
  ]);

  return {
    ts: Date.now(),
    config,
    systemMetrics,
    tasks: { items: tasks, summary: taskSummary },
    skills,
    integrations: buildIntegrationSnapshot(config, mcpStatus, getTelegramBridgeStatus()),
    mcpStatus,
    recentActivity: [...state.recentActivities],
    recentLogs: [...state.recentLogs],
  };
}
