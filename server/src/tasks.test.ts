import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStatusTransition, type TaskRecord } from './tasks.js';

function createTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    title: 'Ship fix',
    skill: 'Task Planner',
    priority: 'medium',
    status: 'done',
    progress: 100,
    createdAt: '2026-04-08T10:00:00.000Z',
    startedAt: '2026-04-08T10:05:00.000Z',
    completedAt: '2026-04-08T10:15:00.000Z',
    description: 'Regression coverage',
    updatedAt: '2026-04-08T10:15:00.000Z',
    ...overrides,
  };
}

test('applyStatusTransition resets progress and timing when moving a task back to backlog', () => {
  const updated = applyStatusTransition(
    createTaskRecord(),
    { status: 'backlog' },
    '2026-04-08T10:30:00.000Z',
  );

  assert.equal(updated.status, 'backlog');
  assert.equal(updated.progress, 0);
  assert.equal(updated.startedAt, undefined);
  assert.equal(updated.completedAt, undefined);
  assert.equal(updated.updatedAt, '2026-04-08T10:30:00.000Z');
});
