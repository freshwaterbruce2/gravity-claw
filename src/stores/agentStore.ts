import { create } from 'zustand';
import {
  DEFAULT_RUNTIME_CONFIG,
  getRuntimeConfig,
  type GravityClawPlatformConfig,
  type GravityClawRuntimeConfig,
  type GravityClawSkillEngineConfig,
} from '../lib/runtimeConfig';

export type AgentStatus = 'online' | 'idle' | 'busy' | 'offline';

export interface ActivityItem {
  id: string;
  type: 'task' | 'skill' | 'error' | 'message' | 'system';
  message: string;
  timestamp: Date;
  skill?: string;
}

interface ActivitySeed {
  id?: string;
  type?: string;
  message?: string;
  tool?: string;
  server?: string;
  skill?: string;
  durationMs?: number;
  ts?: number;
  timestamp?: string | number | Date;
}

interface AgentState {
  name: string;
  model: string;
  status: AgentStatus;
  uptime: number; // seconds
  messageCount: number;
  taskCount: number;
  activeTask: string | null;
  skillCount: number;
  memoryEnabled: boolean;
  gravityMechanicEnabled: boolean;
  beeMemoryEnabled: boolean;
  selfImprovementEnabled: boolean;
  vectorMemoryEnabled: boolean;
  directShellEnabled: boolean;
  workspaceWatchersEnabled: boolean;
  gitPipelineEnabled: boolean;
  oauthLoopholeEmail: string;
  platforms: GravityClawPlatformConfig;
  skillEngine: GravityClawSkillEngineConfig;
  configHydrated: boolean;
  activities: ActivityItem[];

  // Actions
  initializeConfig: () => Promise<void>;
  setStatus: (status: AgentStatus) => void;
  setModel: (model: string) => void;
  setActiveTask: (task: string | null) => void;
  setCounts: (counts: Partial<Pick<AgentState, 'taskCount' | 'skillCount' | 'messageCount'>>) => void;
  incrementMessages: () => void;
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
  replaceActivities: (items: ActivitySeed[]) => void;
  tick: () => void;
  applyRuntimeConfig: (config: GravityClawRuntimeConfig) => void;
  updateMechanics: (mechanics: Partial<GravityClawRuntimeConfig>) => void;
}

function normalizeActivity(item: ActivitySeed): ActivityItem {
  const type =
    item.type === 'task' ||
    item.type === 'skill' ||
    item.type === 'error' ||
    item.type === 'message' ||
    item.type === 'system'
      ? item.type
      : item.type === 'tool_call'
        ? 'skill'
        : 'system';

  const timestampSource = item.timestamp ?? item.ts;
  const timestamp =
    timestampSource instanceof Date
      ? timestampSource
      : timestampSource
        ? new Date(timestampSource)
        : new Date();

  return {
    id: item.id ?? `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    message:
      item.message ??
      (item.type === 'tool_call'
        ? `Tool: ${item.tool ?? 'unknown'} (${item.durationMs ?? 0}ms)`
        : 'Activity event'),
    timestamp,
    skill: item.skill ?? item.server,
  };
}

export const useAgentStore = create<AgentState>((set) => ({
  name: 'G-CLAW-01',
  model: DEFAULT_RUNTIME_CONFIG.model,
  status: 'online',
  uptime: 0,
  messageCount: 0,
  taskCount: 0,
  activeTask: null,
  skillCount: 0,
  memoryEnabled: DEFAULT_RUNTIME_CONFIG.memoryEnabled,
  gravityMechanicEnabled: DEFAULT_RUNTIME_CONFIG.gravityMechanicEnabled,
  beeMemoryEnabled: DEFAULT_RUNTIME_CONFIG.beeMemoryEnabled,
  selfImprovementEnabled: DEFAULT_RUNTIME_CONFIG.selfImprovementEnabled,
  vectorMemoryEnabled: DEFAULT_RUNTIME_CONFIG.vectorMemoryEnabled,
  directShellEnabled: DEFAULT_RUNTIME_CONFIG.directShellEnabled,
  workspaceWatchersEnabled: DEFAULT_RUNTIME_CONFIG.workspaceWatchersEnabled,
  gitPipelineEnabled: DEFAULT_RUNTIME_CONFIG.gitPipelineEnabled,
  oauthLoopholeEmail: DEFAULT_RUNTIME_CONFIG.oauthLoopholeEmail,
  platforms: DEFAULT_RUNTIME_CONFIG.platforms,
  skillEngine: DEFAULT_RUNTIME_CONFIG.skillEngine,
  configHydrated: false,

  activities: [],

  initializeConfig: async () => {
    try {
      const config = await getRuntimeConfig();
      set({
        ...config,
        configHydrated: true,
      });
    } catch {
      set({ configHydrated: true });
    }
  },

  setStatus: (status) => set({ status }),
  setModel: (model) => set({ model }),
  setActiveTask: (task) => set({ activeTask: task }),
  setCounts: (counts) => set((s) => ({ ...s, ...counts })),
  incrementMessages: () => set((s) => ({ messageCount: s.messageCount + 1 })),

  addActivity: (item) =>
    set((s) => ({
      activities: [
        normalizeActivity(item),
        ...s.activities.slice(0, 49),
      ],
    })),
  replaceActivities: (items) =>
    set({
      activities: items.slice(0, 75).map((item) => normalizeActivity(item)),
    }),

  tick: () => set((s) => ({ uptime: s.uptime + 1 })),
  applyRuntimeConfig: (config) =>
    set({
      ...config,
      configHydrated: true,
    }),
  updateMechanics: (mechanics) => set((s) => ({ ...s, ...mechanics })),
}));

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
