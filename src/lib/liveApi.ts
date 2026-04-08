import { buildApiUrl } from './runtime';

export type LiveTaskStatus = 'backlog' | 'running' | 'done';
export type LiveTaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type LiveSkillStatus = 'active' | 'beta' | 'inactive';
export type LiveIntegrationStatus =
  | 'online'
  | 'offline'
  | 'degraded'
  | 'connecting'
  | 'configured'
  | 'disabled';

export interface LiveTask {
  id: string;
  title: string;
  skill: string;
  priority: LiveTaskPriority;
  status: LiveTaskStatus;
  progress: number;
  createdAt: string | number | Date;
  startedAt?: string | number | Date | null;
  completedAt?: string | number | Date | null;
  description?: string;
}

export interface LiveSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  status: LiveSkillStatus;
  useCount: number;
  tags: string[];
}

export interface LiveIntegration {
  id: string;
  name: string;
  status: LiveIntegrationStatus;
  kind?: string;
  health?: string;
  details?: string;
  latencyMs?: number;
  toolCount?: number;
  lastChecked?: number | string | Date;
  enabled?: boolean;
}

export interface LiveActivity {
  id: string;
  type: 'task' | 'skill' | 'error' | 'message' | 'system';
  message: string;
  timestamp: string | number | Date;
  skill?: string;
}

export interface LiveLogEntry {
  id: string;
  level: string;
  message: string;
  timestamp: string | number | Date;
  source?: string;
}

export interface LiveMcpStatus {
  server: string;
  status: 'online' | 'offline' | 'degraded';
  toolCount: number;
  latencyMs: number;
  lastChecked: number;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), init);

  if (!response.ok) {
    const error = await response.text().catch(() => '');
    throw new Error(error || `Unable to load ${path} (HTTP ${response.status})`);
  }

  return (await response.json()) as T;
}

function pickArray(source: unknown, keys: string[]): unknown[] | null {
  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== 'object') {
    return null;
  }

  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function toDate(value: string | number | Date | null | undefined): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

export function normalizeTask(task: Partial<LiveTask> & { id?: string }): LiveTask {
  const status = task.status === 'running' || task.status === 'done' ? task.status : 'backlog';
  const priority =
    task.priority === 'critical' ||
    task.priority === 'high' ||
    task.priority === 'medium' ||
    task.priority === 'low'
      ? task.priority
      : 'medium';

  return {
    id: task.id ?? `task-${Date.now()}`,
    title: task.title ?? 'Untitled task',
    skill: task.skill ?? 'Task Planner',
    priority,
    status,
    progress: Number.isFinite(task.progress ?? NaN) ? Number(task.progress) : 0,
    createdAt: toDate(task.createdAt),
    startedAt: task.startedAt ? toDate(task.startedAt) : null,
    completedAt: task.completedAt ? toDate(task.completedAt) : null,
    description: task.description?.trim() || undefined,
  };
}

export function normalizeTaskList(source: unknown): LiveTask[] {
  const items = pickArray(source, ['tasks', 'taskList', 'items', 'data']);
  return (items ?? []).map((item) => normalizeTask(item as Partial<LiveTask> & { id?: string }));
}

export function normalizeSkill(
  skill: Omit<Partial<LiveSkill>, 'status'> & { id?: string; status?: LiveSkillStatus | 'installed' | 'available' | 'blocked' }
): LiveSkill {
  const status =
    skill.status === 'active' ||
    skill.status === 'beta' ||
    skill.status === 'inactive' ||
    skill.status === 'installed' ||
    skill.status === 'available' ||
    skill.status === 'blocked'
      ? skill.status === 'installed'
        ? 'active'
        : skill.status === 'available'
          ? 'beta'
          : skill.status === 'blocked'
            ? 'inactive'
            : skill.status
      : 'inactive';

  return {
    id: skill.id ?? `skill-${Date.now()}`,
    name: skill.name ?? 'Untitled skill',
    description: skill.description ?? '',
    category: skill.category ?? 'General',
    icon: skill.icon ?? '⬡',
    status,
    useCount: Number.isFinite(skill.useCount ?? NaN) ? Number(skill.useCount) : 0,
    tags: Array.isArray(skill.tags) ? skill.tags.filter(Boolean) : [],
  };
}

export function normalizeSkillList(source: unknown): LiveSkill[] {
  const items = pickArray(source, ['skills', 'available', 'installed', 'skillList', 'items', 'data']);
  return (items ?? []).map((item) => normalizeSkill(item as Partial<LiveSkill> & { id?: string }));
}

export function normalizeIntegration(
  integration: Partial<LiveIntegration> & { id?: string }
): LiveIntegration {
  const status =
    integration.status === 'online' ||
    integration.status === 'offline' ||
    integration.status === 'degraded' ||
    integration.status === 'connecting' ||
    integration.status === 'configured' ||
    integration.status === 'disabled'
      ? integration.status
      : 'offline';

  return {
    id: integration.id ?? `integration-${Date.now()}`,
    name: integration.name ?? 'Unknown integration',
    status,
    kind: integration.kind,
    health: integration.health,
    details: integration.details,
    latencyMs: Number.isFinite(integration.latencyMs ?? NaN) ? Number(integration.latencyMs) : 0,
    toolCount: Number.isFinite(integration.toolCount ?? NaN) ? Number(integration.toolCount) : 0,
    lastChecked: integration.lastChecked ? toDate(integration.lastChecked) : new Date(),
    enabled: integration.enabled ?? true,
  };
}

export function normalizeIntegrationList(source: unknown): LiveIntegration[] {
  const items = pickArray(source, ['integrations', 'channels', 'items', 'data']);
  return (items ?? []).map((item) =>
    normalizeIntegration(item as Partial<LiveIntegration> & { id?: string }),
  );
}

export function normalizeMcpStatusList(source: unknown): LiveMcpStatus[] {
  const items = pickArray(source, ['mcp.status', 'mcpStatus', 'servers', 'items', 'data']);
  return (items ?? []).map((item) => {
    const server = item as Partial<LiveMcpStatus> & { server?: string };
    return {
      server: server.server ?? 'unknown',
      status:
        server.status === 'online' || server.status === 'offline' || server.status === 'degraded'
          ? server.status
          : 'offline',
      toolCount: Number.isFinite(server.toolCount ?? NaN) ? Number(server.toolCount) : 0,
      latencyMs: Number.isFinite(server.latencyMs ?? NaN) ? Number(server.latencyMs) : 0,
      lastChecked: Number.isFinite(server.lastChecked ?? NaN) ? Number(server.lastChecked) : Date.now(),
    };
  });
}

export async function fetchDashboardSnapshot(): Promise<unknown | null> {
  try {
    return await requestJson<unknown>('/api/dashboard');
  } catch {
    return null;
  }
}

export async function fetchTasks(): Promise<LiveTask[]> {
  return normalizeTaskList(await requestJson<unknown>('/api/tasks'));
}

export async function createTask(task: LiveTask): Promise<LiveTask | null> {
  try {
    const payload = await requestJson<unknown>('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        skill: task.skill,
        priority: task.priority,
        status: task.status,
        progress: task.progress,
        description: task.description,
      }),
    });
    const list = normalizeTaskList(payload);
    if (list.length > 0) {
      return list[0];
    }

    if (payload && typeof payload === 'object' && 'task' in payload) {
      return normalizeTask((payload as { task?: Partial<LiveTask> }).task ?? task);
    }
  } catch {
    return null;
  }

  return null;
}

export async function updateTaskOnServer(
  id: string,
  patch: Partial<Pick<LiveTask, 'title' | 'skill' | 'priority' | 'status' | 'progress' | 'description'>>
): Promise<LiveTask | null> {
  try {
    const payload = await requestJson<unknown>('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const list = normalizeTaskList(payload);
    if (list.length > 0) {
      const match = list.find((task) => task.id === id);
      if (match) {
        return match;
      }
    }
    if (payload && typeof payload === 'object' && 'task' in payload) {
      return normalizeTask((payload as { task?: Partial<LiveTask> }).task ?? { id, ...patch });
    }
  } catch {
    return null;
  }

  return null;
}

export async function deleteTaskOnServer(id: string): Promise<boolean> {
  try {
    const response = await fetch(buildApiUrl(`/api/tasks/${encodeURIComponent(id)}`), {
      method: 'DELETE',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function saveTasks(tasks: LiveTask[]): Promise<LiveTask[]> {
  try {
    const payload = await requestJson<unknown>('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks }),
    });
    const normalized = normalizeTaskList(payload);
    return normalized.length > 0 ? normalized : tasks;
  } catch {
    return tasks;
  }
}

export async function fetchSkills(): Promise<LiveSkill[]> {
  return normalizeSkillList(await requestJson<unknown>('/api/skills'));
}

export async function fetchIntegrations(): Promise<LiveIntegration[]> {
  return normalizeIntegrationList(await requestJson<unknown>('/api/integrations'));
}

export function readArrayFromPayload(payload: unknown, keys: string[]): unknown[] | null {
  return pickArray(payload, keys);
}
