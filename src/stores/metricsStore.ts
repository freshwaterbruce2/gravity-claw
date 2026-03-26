import { create } from 'zustand';

export interface SystemMetrics {
  cpu: number;
  memUsed: number;
  memTotal: number;
  uptime: number;
}

interface MetricsState {
  cpu: number;
  memUsed: number;
  memTotal: number;
  uptime: number;
  cpuHistory: number[];
  memHistory: number[];
  lastUpdate: number;
  updateMetrics: (m: SystemMetrics) => void;
}

const MAX_HISTORY = 60;

export const useMetricsStore = create<MetricsState>((set) => ({
  cpu: 0,
  memUsed: 0,
  memTotal: 1,
  uptime: 0,
  cpuHistory: [],
  memHistory: [],
  lastUpdate: 0,
  updateMetrics: (m) =>
    set((s) => ({
      ...m,
      lastUpdate: Date.now(),
      cpuHistory: [...s.cpuHistory.slice(-(MAX_HISTORY - 1)), m.cpu],
      memHistory: [
        ...s.memHistory.slice(-(MAX_HISTORY - 1)),
        Math.round((m.memUsed / m.memTotal) * 100),
      ],
    })),
}));
