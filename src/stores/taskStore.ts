import { create } from 'zustand';
import {
  createTask as createTaskOnServer,
  fetchTasks,
  normalizeTask,
  saveTasks,
  updateTaskOnServer,
  type LiveTask,
  type LiveTaskPriority,
  type LiveTaskStatus,
} from '../lib/liveApi';

export type TaskStatus = LiveTaskStatus;
export type TaskPriority = LiveTaskPriority;
export type Task = LiveTask;

interface TaskState {
  tasks: Task[];
  hydrated: boolean;
  lastUpdated: number;
  loadTasks: (options?: { force?: boolean }) => Promise<void>;
  replaceTasks: (tasks: Task[], options?: { sync?: boolean }) => Promise<void>;
  upsertTask: (task: Task, options?: { sync?: boolean }) => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<void>;
  moveTask: (id: string, status: TaskStatus, options?: { sync?: boolean }) => Promise<void>;
  updateProgress: (
    id: string,
    progress: number,
    options?: { sync?: boolean },
  ) => Promise<void>;
  removeTask: (id: string, options?: { sync?: boolean }) => Promise<void>;
}

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeTaskCollection(tasks: Task[]): Task[] {
  return tasks.map((task) => normalizeTask(task));
}

export const useTaskStore = create<TaskState>((set, get) => {
  const commitTasks = async (nextTasks: Task[], sync = false) => {
    const normalized = normalizeTaskCollection(nextTasks);
    set({
      tasks: normalized,
      hydrated: true,
      lastUpdated: Date.now(),
    });

    if (sync) {
      const saved = await saveTasks(normalized);
      if (saved.length > 0) {
        set({
          tasks: normalizeTaskCollection(saved),
          hydrated: true,
          lastUpdated: Date.now(),
        });
      }
    }
  };

  return {
    tasks: [],
    hydrated: false,
    lastUpdated: 0,

    loadTasks: async (options) => {
      if (get().hydrated && !options?.force) {
        return;
      }

      try {
        const tasks = await fetchTasks();
        set({
          tasks: normalizeTaskCollection(tasks),
          hydrated: true,
          lastUpdated: Date.now(),
        });
      } catch {
        set({ hydrated: true, lastUpdated: Date.now() });
      }
    },

    replaceTasks: async (tasks, options) => {
      await commitTasks(tasks, Boolean(options?.sync));
    },

    upsertTask: async (task, options) => {
      const current = get().tasks;
      const next = current.some((item) => item.id === task.id)
        ? current.map((item) => (item.id === task.id ? task : item))
        : [task, ...current];
      await commitTasks(next, Boolean(options?.sync));
    },

    addTask: async (taskInput) => {
      const created = await createTaskOnServer(
        normalizeTask({
          ...taskInput,
          id: generateTaskId(),
          createdAt: new Date(),
        }),
      );

      if (created) {
        await commitTasks([created, ...get().tasks.filter((task) => task.id !== created.id)], false);
        return;
      }

      await commitTasks(
        [
          normalizeTask({
            ...taskInput,
            id: generateTaskId(),
            createdAt: new Date(),
          }),
          ...get().tasks,
        ],
        false,
      );
    },

    moveTask: async (id, status, options) => {
      const current = get().tasks.find((task) => task.id === id);
      if (!current) {
        return;
      }

      const nextTask = normalizeTask({
        ...current,
        status,
        ...(status === 'running' ? { startedAt: current.startedAt ?? new Date(), progress: 0 } : {}),
        ...(status === 'done' ? { completedAt: new Date(), progress: 100 } : {}),
      });

      const sync = options?.sync ?? true;
      const persisted = sync
        ? await updateTaskOnServer(id, {
            status: nextTask.status,
            progress: nextTask.progress,
          })
        : null;

      const taskToUse = persisted ?? nextTask;
      const next = get().tasks.map((task) => (task.id === id ? taskToUse : task));
      await commitTasks(next, false);
    },

    updateProgress: async (id, progress, options) => {
      const current = get().tasks.find((task) => task.id === id);
      if (!current) {
        return;
      }

      const nextTask = normalizeTask({ ...current, progress });
      const sync = options?.sync ?? true;
      const persisted = sync ? await updateTaskOnServer(id, { progress: nextTask.progress }) : null;
      const taskToUse = persisted ?? nextTask;
      const next = get().tasks.map((task) => (task.id === id ? taskToUse : task));
      await commitTasks(next, false);
    },

    removeTask: async (id, options) => {
      const next = get().tasks.filter((task) => task.id !== id);
      await commitTasks(next, options?.sync ?? true);
    },
  };
});
