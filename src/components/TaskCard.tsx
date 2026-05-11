import { useCallback } from 'react';
import { type Task, type TaskStatus } from '../stores/taskStore';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'red',
  high: 'amber',
  medium: 'blue',
  low: 'muted',
};

interface TaskCardProps {
  task: Task;
  onMove: (id: string, s: TaskStatus) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
}

export default function TaskCard({ task, onMove, onRemove }: TaskCardProps) {
  const handleRemove = useCallback(() => onRemove(task.id), [onRemove, task.id]);
  const handleMoveToRunning = useCallback(() => onMove(task.id, 'running'), [onMove, task.id]);
  const handleMoveToDone = useCallback(() => onMove(task.id, 'done'), [onMove, task.id]);
  const handleMoveToBacklog = useCallback(() => onMove(task.id, 'backlog'), [onMove, task.id]);

  return (
    <div className="task-card">
      <div className="task-card-header">
        <span className={`badge badge-${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
        <button type="button" className="task-remove-btn" onClick={handleRemove} title="Remove">
          ✕
        </button>
      </div>
      <div className="task-title">{task.title}</div>
      {task.description && <p className="task-desc">{task.description}</p>}
      <div className="task-skill-row">
        <span className="tag">⬡ {task.skill}</span>
      </div>
      {task.status === 'running' && (
        <div className="task-progress">
          <div className="flex justify-between items-center task-progress-header">
            <span className="text-muted task-progress-label">
              Progress
            </span>
            <span className="font-code text-amber task-progress-value">
              {task.progress}%
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill progress-fill--amber"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}
      <div className="task-meta font-code text-xs text-muted">
        {task.startedAt && (
          <span>
            ▶{' '}
            {new Date(task.startedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
        {task.completedAt && <span>✓ done</span>}
      </div>
      <div className="task-actions">
        {task.status === 'backlog' && (
          <button
            type="button"
            className="btn btn-ghost task-action-btn"
            onClick={handleMoveToRunning}
          >
            ▶ Start
          </button>
        )}
        {task.status === 'running' && (
          <button type="button" className="btn btn-ghost task-action-btn" onClick={handleMoveToDone}>
            ✓ Done
          </button>
        )}
        {task.status === 'done' && (
          <button
            type="button"
            className="btn btn-ghost task-action-btn"
            onClick={handleMoveToBacklog}
          >
            ↺ Reset
          </button>
        )}
      </div>
    </div>
  );
}
