import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type TaskStatus = 'backlog' | 'running' | 'done';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface TaskRecord {
  id: string;
  title: string;
  skill: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  description?: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  skill: string;
  priority: TaskPriority;
  status?: TaskStatus;
  progress?: number;
  description?: string;
}

export interface TaskPatch {
  title?: string;
  skill?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  progress?: number;
  description?: string | null;
}

export interface TaskSummary {
  total: number;
  backlog: number;
  running: number;
  done: number;
  averageProgress: number;
}

const TASKS_PATH = path.join(process.cwd(), '.gravity-claw.tasks.json');
const DEFAULT_STATUS: TaskStatus = 'backlog';

let cachedTasks: TaskRecord[] | null = null;

function nowIso() {
  return new Date().toISOString();
}

function clampProgress(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeTask(task: Partial<TaskRecord> & Pick<TaskRecord, 'id' | 'title' | 'skill' | 'priority'>): TaskRecord {
  const status = task.status ?? DEFAULT_STATUS;
  const createdAt = typeof task.createdAt === 'string' ? task.createdAt : nowIso();
  const startedAt = typeof task.startedAt === 'string' ? task.startedAt : undefined;
  const completedAt = typeof task.completedAt === 'string' ? task.completedAt : undefined;
  const progress = clampProgress(task.progress, status === 'done' ? 100 : 0);

  return {
    id: task.id,
    title: task.title,
    skill: task.skill,
    priority: task.priority,
    status,
    progress: status === 'done' ? 100 : progress,
    createdAt,
    startedAt,
    completedAt,
    description: typeof task.description === 'string' ? task.description : undefined,
    updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : createdAt,
  };
}

async function loadFromDisk(): Promise<TaskRecord[]> {
  try {
    const raw = await readFile(TASKS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { tasks?: Partial<TaskRecord>[] };
    if (!Array.isArray(parsed.tasks)) {
      return [];
    }
    return parsed.tasks
      .filter((task): task is Partial<TaskRecord> & Pick<TaskRecord, 'id' | 'title' | 'skill' | 'priority'> =>
        Boolean(task && typeof task.id === 'string' && typeof task.title === 'string' && typeof task.skill === 'string' && typeof task.priority === 'string'))
      .map((task) => normalizeTask(task));
  } catch {
    return [];
  }
}

async function persistTasks(tasks: TaskRecord[]): Promise<void> {
  await mkdir(path.dirname(TASKS_PATH), { recursive: true });
  await writeFile(TASKS_PATH, JSON.stringify({ tasks }, null, 2), 'utf8');
}

function ensureCache(tasks: TaskRecord[]) {
  cachedTasks = tasks.map((task) => normalizeTask(task));
  return cachedTasks;
}

export async function listTasks(): Promise<TaskRecord[]> {
  if (!cachedTasks) {
    cachedTasks = await loadFromDisk();
  }

  return cachedTasks.map((task) => ({ ...task }));
}

export async function getTaskById(taskId: string): Promise<TaskRecord | null> {
  const tasks = await listTasks();
  return tasks.find((task) => task.id === taskId) ?? null;
}

export async function createTask(input: TaskInput): Promise<TaskRecord> {
  const tasks = await listTasks();
  const createdAt = nowIso();
  const status = input.status ?? DEFAULT_STATUS;
  const task: TaskRecord = normalizeTask({
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim(),
    skill: input.skill.trim(),
    priority: input.priority,
    status,
    progress: input.progress ?? (status === 'done' ? 100 : 0),
    description: input.description?.trim() || undefined,
    createdAt,
    updatedAt: createdAt,
    startedAt: status === 'running' ? createdAt : undefined,
    completedAt: status === 'done' ? createdAt : undefined,
  });

  const nextTasks = [task, ...tasks];
  await persistTasks(nextTasks);
  ensureCache(nextTasks);
  return { ...task };
}

export function applyStatusTransition(task: TaskRecord, patch: TaskPatch, timestamp: string): TaskRecord {
  const nextStatus = patch.status ?? task.status;
  const nextProgress = clampProgress(patch.progress, task.progress);
  const startedAt =
    nextStatus === 'running'
      ? task.status === 'running'
        ? task.startedAt ?? timestamp
        : timestamp
      : nextStatus === 'backlog'
        ? undefined
        : task.startedAt;
  const completedAt =
    nextStatus === 'done'
      ? task.status === 'done'
        ? task.completedAt ?? timestamp
        : timestamp
      : undefined;
  const progress =
    nextStatus === 'done' ? 100 : nextStatus === 'backlog' ? 0 : nextProgress;

  return normalizeTask({
    ...task,
    title: patch.title?.trim() || task.title,
    skill: patch.skill?.trim() || task.skill,
    priority: patch.priority ?? task.priority,
    status: nextStatus,
    progress,
    description: patch.description === null ? undefined : patch.description?.trim() || task.description,
    startedAt,
    completedAt,
    updatedAt: timestamp,
  });
}

export async function updateTask(taskId: string, patch: TaskPatch): Promise<TaskRecord | null> {
  const tasks = await listTasks();
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return null;
  }

  const timestamp = nowIso();
  const updated = applyStatusTransition(tasks[index], patch, timestamp);
  const nextTasks = tasks.map((task) => (task.id === taskId ? updated : task));
  await persistTasks(nextTasks);
  ensureCache(nextTasks);
  return { ...updated };
}

export async function removeTask(taskId: string): Promise<TaskRecord | null> {
  const tasks = await listTasks();
  const nextTasks = tasks.filter((task) => task.id !== taskId);
  if (nextTasks.length === tasks.length) {
    return null;
  }

  const removed = tasks.find((task) => task.id === taskId) ?? null;
  await persistTasks(nextTasks);
  ensureCache(nextTasks);
  return removed ? { ...removed } : null;
}

export async function replaceTasks(tasks: TaskRecord[]): Promise<TaskRecord[]> {
  const normalized = tasks.map((task) => normalizeTask(task));
  await persistTasks(normalized);
  ensureCache(normalized);
  return normalized.map((task) => ({ ...task }));
}

export async function summarizeTasks(): Promise<TaskSummary> {
  const tasks = await listTasks();
  const summary: TaskSummary = {
    total: tasks.length,
    backlog: 0,
    running: 0,
    done: 0,
    averageProgress: 0,
  };

  if (tasks.length === 0) {
    return summary;
  }

  let progressTotal = 0;
  for (const task of tasks) {
    summary[task.status] += 1;
    progressTotal += task.progress;
  }

  summary.averageProgress = Math.round(progressTotal / tasks.length);
  return summary;
}
