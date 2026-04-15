import { createEventBus } from './event-bus.js';
import type { ChildProcess } from 'node:child_process';
import type { GravityClawConfig } from './config.js';
import type { McpServerHealth } from './mcp-health.js';
import type { McpServerWithTools } from './mcp.js';
import type { GeminiFunctionTool, LogEntryRecord, AgentActivityRecord } from './types-internal.js';

export const RECENT_EVENT_LIMIT = 50;
export const RECENT_ACTIVITY_LIMIT = 75;

type EventBus = ReturnType<typeof createEventBus>;

// Single mutable state object shared by all server modules
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
  appConfig: {} as GravityClawConfig,
  geminiFunctionTool: null,
  availableMcpToolsMap: {},
  availableServerTools: [],
  memoryContext: '',
  lastMcpHealth: [],
  recentLogs: [],
  recentActivities: [],
  soulContent: 'You are G-CLAW, an advanced autonomous AI agent assistant.',
  eventBus: null as unknown as EventBus,
  mcpGatewayProcess: null,
};
