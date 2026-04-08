import { create } from 'zustand';
import {
  createTask as createTaskOnServer,
  deleteTaskOnServer,
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

export function buildMovedTask(task: Task, status: TaskStatus, now = new Date()): Task {
  if (status === 'backlog') {
    return normalizeTask({
      ...task,
      status,
      progress: 0,
      startedAt: null,
      completedAt: null,
    });
  }

  if (status === 'running') {
    return normalizeTask({
      ...task,
      status,
      progress: task.status === 'running' ? task.progress : 0,
      startedAt: task.status === 'running' ? task.startedAt ?? now : now,
      completedAt: null,
    });
  }

  return normalizeTask({
    ...task,
    status,
    progress: 100,
    startedAt: task.startedAt ?? now,
    completedAt: task.status === 'done' ? task.completedAt ?? now : now,
  });
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

      const nextTask = buildMovedTask(current, status);

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
      if (options?.sync ?? true) {
        await deleteTaskOnServer(id);
      }
      await commitTasks(next, false);
    },
  };
});
