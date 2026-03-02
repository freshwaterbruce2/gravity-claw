import { create } from 'zustand';

export type AgentStatus = 'online' | 'idle' | 'busy' | 'offline';

export interface ActivityItem {
  id: string;
  type: 'task' | 'skill' | 'error' | 'message' | 'system';
  message: string;
  timestamp: Date;
  skill?: string;
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
  oauthLoopholeEmail: string;
  activities: ActivityItem[];

  // Actions
  setStatus: (status: AgentStatus) => void;
  setActiveTask: (task: string | null) => void;
  incrementMessages: () => void;
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
  tick: () => void;
  updateMechanics: (mechanics: Partial<Pick<AgentState, 'gravityMechanicEnabled' | 'beeMemoryEnabled' | 'selfImprovementEnabled' | 'oauthLoopholeEmail'>>) => void;
}

const SEED_ACTIVITIES: Omit<ActivityItem, 'id' | 'timestamp'>[] = [
  { type: 'system', message: 'Gravity-Claw agent initialized', skill: undefined },
  { type: 'skill', message: 'Web Search: \"latest AI news\" — 10 results', skill: 'Web Search' },
  { type: 'task', message: 'Task complete: Weekly email digest sent', skill: 'Email Manager' },
  { type: 'skill', message: 'File Reader: Processed project-report.pdf', skill: 'File Reader' },
  { type: 'message', message: 'User message received via Telegram', skill: 'Telegram Bridge' },
  {
    type: 'task',
    message: 'Reminder triggered: Stand-up meeting in 10 min',
    skill: 'Reminder Bot',
  },
  {
    type: 'skill',
    message: 'Calendar: Created event "Product Demo" for tomorrow',
    skill: 'Calendar Manager',
  },
  {
    type: 'skill',
    message: 'Code Writer: Generated TypeScript utility function',
    skill: 'Code Writer',
  },
];

let seedTime = Date.now() - 8 * 60 * 1000;

export const useAgentStore = create<AgentState>((set) => ({
  name: 'G-CLAW-01',
  model: 'gemini-2.0-flash',
  status: 'online',
  uptime: 14400 + Math.floor(Math.random() * 3600),
  messageCount: 247,
  taskCount: 34,
  activeTask: null,
  skillCount: 34,
  memoryEnabled: true,
  gravityMechanicEnabled: true,
  beeMemoryEnabled: true,
  selfImprovementEnabled: true,
  oauthLoopholeEmail: 'bruceybabybot@gmail.com',

  activities: SEED_ACTIVITIES.map((a, i) => ({
    ...a,
    id: `seed-${i}`,
    timestamp: new Date(seedTime + i * 75000),
  })).reverse(),

  setStatus: (status) => set({ status }),
  setActiveTask: (task) => set({ activeTask: task }),
  incrementMessages: () => set((s) => ({ messageCount: s.messageCount + 1 })),

  addActivity: (item) =>
    set((s) => ({
      activities: [
        { ...item, id: `act-${Date.now()}`, timestamp: new Date() },
        ...s.activities.slice(0, 49),
      ],
    })),

  tick: () => set((s) => ({ uptime: s.uptime + 1 })),
  updateMechanics: (mechanics) => set((s) => ({ ...s, ...mechanics })),
}));

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
