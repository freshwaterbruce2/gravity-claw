import { create } from 'zustand';

export type TaskStatus = 'backlog' | 'running' | 'done';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  skill: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number; // 0-100
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  description?: string;
}

interface TaskState {
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  updateProgress: (id: string, progress: number) => void;
  removeTask: (id: string) => void;
}

const SEED_TASKS: Task[] = [
  {
    id: 't1',
    title: 'Monitor competitor pricing daily',
    skill: 'Web Scraper',
    priority: 'high',
    status: 'running',
    progress: 65,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    description: 'Scrape prices from 5 competitor sites and notify on changes > 10%',
  },
  {
    id: 't2',
    title: 'Weekly newsletter draft',
    skill: 'Content Writer',
    priority: 'high',
    status: 'running',
    progress: 30,
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: 't3',
    title: 'Organize /Downloads folder',
    skill: 'Folder Organizer',
    priority: 'medium',
    status: 'backlog',
    progress: 0,
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: 't4',
    title: 'Generate unit tests for auth module',
    skill: 'Test Writer',
    priority: 'medium',
    status: 'backlog',
    progress: 0,
    createdAt: new Date(Date.now() - 15 * 60 * 1000),
  },
  {
    id: 't5',
    title: 'Research LLM benchmarks 2026',
    skill: 'Deep Researcher',
    priority: 'low',
    status: 'backlog',
    progress: 0,
    createdAt: new Date(Date.now() - 10 * 60 * 1000),
  },
  {
    id: 't6',
    title: 'Email digest — AI news summary',
    skill: 'Email Manager',
    priority: 'medium',
    status: 'done',
    progress: 100,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000),
  },
  {
    id: 't7',
    title: 'Calendar: Schedule 1:1s for March',
    skill: 'Calendar Manager',
    priority: 'high',
    status: 'done',
    progress: 100,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  {
    id: 't8',
    title: 'Fix TypeScript errors in api.ts',
    skill: 'Code Debugger',
    priority: 'critical',
    status: 'done',
    progress: 100,
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
  },
];

export const useTaskStore = create<TaskState>((set) => ({
  tasks: SEED_TASKS,

  addTask: (task) =>
    set((s) => ({
      tasks: [
        {
          ...task,
          id: `task-${Date.now()}`,
          createdAt: new Date(),
        },
        ...s.tasks,
      ],
    })),

  moveTask: (id, status) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              ...(status === 'running' ? { startedAt: new Date(), progress: 0 } : {}),
              ...(status === 'done' ? { completedAt: new Date(), progress: 100 } : {}),
            }
          : t,
      ),
    })),

  updateProgress: (id, progress) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, progress } : t)),
    })),

  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
}));
