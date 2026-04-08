import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMovedTask, type Task } from './taskStore';

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
