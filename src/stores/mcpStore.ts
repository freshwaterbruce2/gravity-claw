import { create } from 'zustand';

export interface McpServerStatus {
  server: string;
  status: 'online' | 'offline' | 'degraded';
  toolCount: number;
  latencyMs: number;
  lastChecked: number;
}

interface McpState {
  servers: McpServerStatus[];
  updateServers: (servers: McpServerStatus[]) => void;
}

export const useMcpStore = create<McpState>((set) => ({
  servers: [],
  updateServers: (servers) => set({ servers }),
}));
