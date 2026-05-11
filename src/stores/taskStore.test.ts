import assert from 'node:assert/strict';
import test from 'node:test';
import { useTaskStore, buildMovedTask, type Task } from './taskStore';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Ship fix',
    skill: 'Task Planner',
    priority: 'medium',
    status: 'done',
    progress: 100,
    createdAt: new Date('2026-04-08T10:00:00.000Z'),
    startedAt: new Date('2026-04-08T10:05:00.000Z'),
    completedAt: new Date('2026-04-08T10:15:00.000Z'),
    description: 'Regression coverage',
    ...overrides,
  };
}

test('buildMovedTask clears progress and timestamps when resetting to backlog', () => {
  const moved = buildMovedTask(
    createTask(),
    'backlog',
    new Date('2026-04-08T10:30:00.000Z'),
  );

  assert.equal(moved.status, 'backlog');
  assert.equal(moved.progress, 0);
  assert.equal(moved.startedAt, null);
  assert.equal(moved.completedAt, null);
});

test('buildMovedTask sets running state and timestamps', () => {
  const now = new Date('2026-04-08T10:30:00.000Z');
  const moved = buildMovedTask(
    createTask({ status: 'backlog', progress: 0, startedAt: null, completedAt: null }),
    'running',
    now,
  );

  assert.equal(moved.status, 'running');
  assert.equal(moved.progress, 0);
  assert.ok(moved.startedAt instanceof Date);
  assert.equal(moved.completedAt, null);
});

test('buildMovedTask preserves running timestamp when already running', () => {
  const startedAt = new Date('2026-04-08T10:05:00.000Z');
  const moved = buildMovedTask(
    createTask({ status: 'running', progress: 50, startedAt }),
    'running',
    new Date('2026-04-08T10:30:00.000Z'),
  );

  assert.equal(moved.status, 'running');
  assert.equal(moved.progress, 50);
  assert.deepEqual(moved.startedAt, startedAt);
  assert.equal(moved.completedAt, null);
});

test('buildMovedTask sets done state and timestamps', () => {
  const now = new Date('2026-04-08T10:30:00.000Z');
  const startedAt = new Date('2026-04-08T10:05:00.000Z');
  const moved = buildMovedTask(
    createTask({ status: 'running', progress: 50, startedAt, completedAt: null }),
    'done',
    now,
  );

  assert.equal(moved.status, 'done');
  assert.equal(moved.progress, 100);
  assert.deepEqual(moved.startedAt, startedAt);
  assert.ok(moved.completedAt instanceof Date);
});

test('buildMovedTask preserves completedAt when already done', () => {
  const completedAt = new Date('2026-04-08T10:15:00.000Z');
  const moved = buildMovedTask(
    createTask({ status: 'done', completedAt }),
    'done',
    new Date('2026-04-08T10:30:00.000Z'),
  );

  assert.equal(moved.status, 'done');
  assert.equal(moved.progress, 100);
  assert.deepEqual(moved.completedAt, completedAt);
});

function mockFetchResponse(body: unknown, status = 200) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

test('taskStore loadTasks fetches and hydrates tasks', async () => {
  const originalFetch = globalThis.fetch;
  const task = createTask({ id: 'task-2', status: 'backlog', progress: 0, startedAt: null, completedAt: null });

  globalThis.fetch = mockFetchResponse({ tasks: [task] });

  try {
    const store = useTaskStore;
    store.setState({ tasks: [], hydrated: false, lastUpdated: 0 });
    await store.getState().loadTasks({ force: true });
    assert.equal(store.getState().tasks.length, 1);
    assert.equal(store.getState().hydrated, true);
    assert.ok(store.getState().lastUpdated > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('taskStore replaceTasks updates tasks with sync', async () => {
  const originalFetch = globalThis.fetch;
  const task = createTask({ id: 'task-3' });

  globalThis.fetch = mockFetchResponse({ tasks: [task] });

  try {
    const store = useTaskStore;
    store.setState({ tasks: [], hydrated: false, lastUpdated: 0 });
    await store.getState().replaceTasks([task], { sync: true });
    assert.equal(store.getState().tasks.length, 1);
    assert.equal(store.getState().tasks[0]?.id, 'task-3');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('taskStore upsertTask adds new task', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = mockFetchResponse({ tasks: [] });

  try {
    const store = useTaskStore;
    store.setState({ tasks: [], hydrated: false, lastUpdated: 0 });
    const newTask = createTask({ id: 'task-new' });
    await store.getState().upsertTask(newTask, { sync: false });
    assert.equal(store.getState().tasks.length, 1);
    assert.equal(store.getState().tasks[0]?.id, 'task-new');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('taskStore moveTask updates task status', async () => {
  const originalFetch = globalThis.fetch;
  const task = createTask({ id: 'task-move', status: 'backlog', progress: 0, startedAt: null, completedAt: null });

  globalThis.fetch = mockFetchResponse({ tasks: [{ ...task, status: 'running' }] });

  try {
    const store = useTaskStore;
    store.setState({ tasks: [task], hydrated: true, lastUpdated: 0 });
    await store.getState().moveTask('task-move', 'running', { sync: true });
    assert.equal(store.getState().tasks[0]?.status, 'running');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('taskStore updateProgress updates task progress', async () => {
  const originalFetch = globalThis.fetch;
  const task = createTask({ id: 'task-prog', status: 'running', progress: 10, startedAt: new Date(), completedAt: null });

  globalThis.fetch = mockFetchResponse({ tasks: [{ ...task, progress: 50 }] });

  try {
    const store = useTaskStore;
    store.setState({ tasks: [task], hydrated: true, lastUpdated: 0 });
    await store.getState().updateProgress('task-prog', 50, { sync: true });
    assert.equal(store.getState().tasks[0]?.progress, 50);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('taskStore removeTask deletes task', async () => {
  const originalFetch = globalThis.fetch;
  const task = createTask({ id: 'task-del' });

  globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 });

  try {
    const store = useTaskStore;
    store.setState({ tasks: [task], hydrated: true, lastUpdated: 0 });
    await store.getState().removeTask('task-del', { sync: true });
    assert.equal(store.getState().tasks.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
