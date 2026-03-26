import { create } from 'zustand';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'SKILL';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: Date;
  source?: string;
}

interface LogState {
  logs: LogEntry[];
  addLog: (entry: { level: string; message: string; source?: string; ts?: number }) => void;
  replaceLogs: (entries: Array<{ level: string; message: string; source?: string; ts?: number }>) => void;
  clearLogs: () => void;
}

function normalizeLog(entry: { level: string; message: string; source?: string; ts?: number }): LogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    level: (entry.level?.toUpperCase() as LogLevel) || 'INFO',
    message: entry.message,
    timestamp: new Date(entry.ts ?? Date.now()),
    source: entry.source,
  };
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  addLog: (entry) =>
    set((s) => ({
      logs: [...s.logs.slice(-500), normalizeLog(entry)],
    })),
  replaceLogs: (entries) => set({ logs: entries.slice(-500).map((entry) => normalizeLog(entry)) }),
  clearLogs: () => set({ logs: [] }),
}));
