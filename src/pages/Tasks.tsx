import { useState } from 'react';
import { useTaskStore, type Task, type TaskStatus } from '../stores/taskStore';
import './Tasks.css';

const COLUMNS: { id: TaskStatus; label: string; icon: string }[] = [
  { id: 'backlog', label: 'BACKLOG', icon: '▦' },
  { id: 'running', label: 'IN PROGRESS', icon: '◉' },
  { id: 'done', label: 'DONE', icon: '✓' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'red',
  high: 'amber',
  medium: 'blue',
  low: 'muted',
};

export default function Tasks() {
  const { tasks, moveTask, addTask, removeTask } = useTaskStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTask({
      title: newTitle.trim(),
      skill: 'Task Planner',
      priority: 'medium',
      status: 'backlog',
      progress: 0,
    });
    setNewTitle('');
    setShowAdd(false);
  };

  return (
    <div className="tasks-page animate-in">
      <div className="tasks-header">
        <div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 4 }}>Task Board</h3>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
            {tasks.filter((t) => t.status === 'running').length} running ·{' '}
            {tasks.filter((t) => t.status === 'done').length} completed
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          + New Task
        </button>
      </div>

      {showAdd && (
        <div className="add-task-bar animate-in">
          <input
            className="add-task-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task description..."
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleAdd}>
            Add
          </button>
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="kanban-board">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="kanban-col">
              <div className="kanban-col-header">
                <div className="flex items-center gap-2">
                  <span
                    className={`col-icon text-${col.id === 'done' ? 'green' : col.id === 'running' ? 'amber' : 'muted'}`}
                  >
                    {col.icon}
                  </span>
                  <span className="section-title">{col.label}</span>
                </div>
                <span
                  className={`badge badge-${col.id === 'done' ? 'green' : col.id === 'running' ? 'amber' : 'muted'}`}
                >
                  {colTasks.length}
                </span>
              </div>
              <div className="kanban-cards">
                {colTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onMove={moveTask} onRemove={removeTask} />
                ))}
                {colTasks.length === 0 && (
                  <div className="kanban-empty font-code text-xs text-muted">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onMove,
  onRemove,
}: {
  task: Task;
  onMove: (id: string, s: TaskStatus) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="task-card">
      <div className="task-card-header">
        <span className={`badge badge-${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
        <button className="task-remove-btn" onClick={() => onRemove(task.id)} title="Remove">
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
          <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
            <span className="text-muted" style={{ fontSize: 10 }}>
              Progress
            </span>
            <span className="font-code text-amber" style={{ fontSize: 10 }}>
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
            className="btn btn-ghost task-action-btn"
            onClick={() => onMove(task.id, 'running')}
          >
            ▶ Start
          </button>
        )}
        {task.status === 'running' && (
          <button className="btn btn-ghost task-action-btn" onClick={() => onMove(task.id, 'done')}>
            ✓ Done
          </button>
        )}
        {task.status === 'done' && (
          <button
            className="btn btn-ghost task-action-btn"
            onClick={() => onMove(task.id, 'backlog')}
          >
            ↺ Reset
          </button>
        )}
      </div>
    </div>
  );
}
