import type { createEventBus } from './event-bus.js';
import type { ChildProcess } from 'node:child_process';
import type { GravityClawConfig } from './config.js';
import type { McpServerHealth } from './mcp-health.js';
import type { McpServerWithTools } from './mcp.js';
import type { GeminiFunctionTool, LogEntryRecord, AgentActivityRecord } from './types-internal.js';

export const RECENT_EVENT_LIMIT = 50;
export const RECENT_ACTIVITY_LIMIT = 75;

type EventBus = ReturnType<typeof createEventBus>;

// Single mutable state object shared by all server modules
// Safe no-op event bus stub used before real initialization
const noopEventBus = {
  subscribe: () => () => {},
  unsubscribe: () => {},
  emit: () => {},
  getSnapshot: () => new Map<string, unknown>(),
  subscriberCount: 0,
} as unknown as EventBus;

export const state: {
  appConfig: GravityClawConfig;
  geminiFunctionTool: GeminiFunctionTool | null;
  availableMcpToolsMap: Record<string, { server: string; tool: string }>;
  availableServerTools: McpServerWithTools[];
  memoryContext: string;
  lastMcpHealth: McpServerHealth[];
  recentLogs: LogEntryRecord[];
  recentActivities: AgentActivityRecord[];
  soulContent: string;
  eventBus: EventBus;
  mcpGatewayProcess: ChildProcess | null;
} = {
  // NOTE: overwritten during boot in index.ts before any traffic arrives.
  appConfig: {} as GravityClawConfig,
  geminiFunctionTool: null,
  availableMcpToolsMap: {},
  availableServerTools: [],
  memoryContext: '',
  lastMcpHealth: [],
  recentLogs: [],
  recentActivities: [],
  soulContent: 'You are G-CLAW, an advanced autonomous AI agent assistant.',
  eventBus: noopEventBus,
  mcpGatewayProcess: null,
};
