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

test('applyStatusTransition sets running state and timestamps', () => {
  const updated = applyStatusTransition(
    createTaskRecord({ status: 'backlog', progress: 0, startedAt: undefined, completedAt: undefined }),
    { status: 'running' },
    '2026-04-08T10:30:00.000Z',
  );

  assert.equal(updated.status, 'running');
  assert.equal(updated.progress, 0);
  assert.equal(updated.startedAt, '2026-04-08T10:30:00.000Z');
  assert.equal(updated.completedAt, undefined);
  assert.equal(updated.updatedAt, '2026-04-08T10:30:00.000Z');
});

test('applyStatusTransition preserves running timestamp when already running', () => {
  const updated = applyStatusTransition(
    createTaskRecord({ status: 'running', progress: 50, startedAt: '2026-04-08T10:05:00.000Z', completedAt: undefined }),
    { status: 'running' },
    '2026-04-08T10:30:00.000Z',
  );

  assert.equal(updated.status, 'running');
  assert.equal(updated.progress, 50);
  assert.equal(updated.startedAt, '2026-04-08T10:05:00.000Z');
  assert.equal(updated.completedAt, undefined);
});

test('applyStatusTransition sets done state and timestamps', () => {
  const updated = applyStatusTransition(
    createTaskRecord({ status: 'running', progress: 50, startedAt: '2026-04-08T10:05:00.000Z', completedAt: undefined }),
    { status: 'done' },
    '2026-04-08T10:30:00.000Z',
  );

  assert.equal(updated.status, 'done');
  assert.equal(updated.progress, 100);
  assert.equal(updated.startedAt, '2026-04-08T10:05:00.000Z');
  assert.equal(updated.completedAt, '2026-04-08T10:30:00.000Z');
  assert.equal(updated.updatedAt, '2026-04-08T10:30:00.000Z');
});

test('applyStatusTransition preserves completedAt when already done', () => {
  const updated = applyStatusTransition(
    createTaskRecord({ status: 'done', completedAt: '2026-04-08T10:15:00.000Z' }),
    { status: 'done' },
    '2026-04-08T10:30:00.000Z',
  );

  assert.equal(updated.status, 'done');
  assert.equal(updated.progress, 100);
  assert.equal(updated.completedAt, '2026-04-08T10:15:00.000Z');
});

test('applyStatusTransition applies partial patch without changing status', () => {
  const updated = applyStatusTransition(
    createTaskRecord(),
    { title: 'Updated title', priority: 'high' },
    '2026-04-08T10:30:00.000Z',
  );

  assert.equal(updated.title, 'Updated title');
  assert.equal(updated.priority, 'high');
  assert.equal(updated.status, 'done');
  assert.equal(updated.progress, 100);
  assert.equal(updated.skill, 'Task Planner');
  assert.equal(updated.updatedAt, '2026-04-08T10:30:00.000Z');
});

test('applyStatusTransition clears description when set to null', () => {
  const updated = applyStatusTransition(
    createTaskRecord(),
    { description: null },
    '2026-04-08T10:30:00.000Z',
  );

  assert.equal(updated.description, undefined);
});

test('applyStatusTransition updates description when provided', () => {
  const updated = applyStatusTransition(
    createTaskRecord(),
    { description: 'new desc' },
    '2026-04-08T10:30:00.000Z',
  );

  assert.equal(updated.description, 'new desc');
});
