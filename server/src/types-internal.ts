import type { FunctionDeclaration } from '@google/generative-ai';
import type { GravityClawConfig } from './config.js';
import type { SystemMetricsData } from './system-metrics.js';
import type { TaskRecord, summarizeTasks } from './tasks.js';
import type { SkillsSnapshot } from './skills.js';
import type { McpServerHealth } from './mcp-health.js';
import type { buildIntegrationSnapshot } from './integrations.js';

export type GeminiFunctionTool = {
  functionDeclarations: FunctionDeclaration[];
};

export interface LogEntryRecord {
  level: 'debug' | 'info' | 'warn' | 'error' | 'skill';
  message: string;
  source: string;
  ts: number;
}

export interface AgentActivityRecord {
  type: 'task' | 'skill' | 'error' | 'message' | 'system' | 'tool_call';
  tool: string;
  server?: string;
  durationMs: number;
  ts: number;
}

export interface DashboardSnapshot {
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
