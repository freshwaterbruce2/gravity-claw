import type { Page } from '../../App';
import { useTaskStore } from '../../stores/taskStore';

interface ActiveTasksWidgetProps {
  onNavigate: (page: Page) => void;
}

function TaskDonut({ running, backlog, done }: { running: number; backlog: number; done: number }) {
  const total = running + backlog + done || 1;
  const r = 20;
  const c = 2 * Math.PI * r;
  const runPct = (running / total) * c;
  const backPct = (backlog / total) * c;
  const donePct = (done / total) * c;

  return (
    <svg width={48} height={48} viewBox="0 0 48 48" className="task-donut" aria-hidden>
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={5} />
      <circle
        cx={24} cy={24} r={r} fill="none" stroke="var(--amber)" strokeWidth={5}
        strokeDasharray={`${runPct} ${c}`} strokeDashoffset={0}
        transform="rotate(-90 24 24)" strokeLinecap="round"
      />
      <circle
        cx={24} cy={24} r={r} fill="none" stroke="var(--cyan)" strokeWidth={5}
        strokeDasharray={`${backPct} ${c}`} strokeDashoffset={-runPct}
        transform="rotate(-90 24 24)" strokeLinecap="round"
      />
      <circle
        cx={24} cy={24} r={r} fill="none" stroke="var(--green)" strokeWidth={5}
        strokeDasharray={`${donePct} ${c}`} strokeDashoffset={-(runPct + backPct)}
        transform="rotate(-90 24 24)" strokeLinecap="round"
      />
      <text x={24} y={24} textAnchor="middle" dominantBaseline="central"
        fill="var(--text-primary)" fontSize={11} fontWeight={700}>
        {total}
      </text>
    </svg>
  );
}

export default function ActiveTasksWidget({ onNavigate }: ActiveTasksWidgetProps) {
  const { tasks } = useTaskStore();
  const running = tasks.filter((t) => t.status === 'running');
  const backlog = tasks.filter((t) => t.status === 'backlog').length;
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <section className="card widget-tasks">
      <div className="section-header">
        <span className="section-title">ACTIVE TASKS</span>
        <button
          className="btn btn-ghost"
          style={{ height: 26, fontSize: 11 }}
          onClick={() => onNavigate('tasks')}
        >
          View all
        </button>
      </div>

      <div className="widget-task-donut-row">
        <TaskDonut running={running.length} backlog={backlog} done={done} />
        <div className="widget-task-legend">
          <span className="font-code text-amber" style={{ fontSize: 10 }}>{running.length} running</span>
          <span className="font-code text-cyan" style={{ fontSize: 10 }}>{backlog} backlog</span>
          <span className="font-code text-green" style={{ fontSize: 10 }}>{done} done</span>
        </div>
      </div>

      {running.length === 0 ? (
        <div className="widget-empty">No running tasks</div>
      ) : (
        <div className="widget-task-list">
          {running.slice(0, 4).map((task) => (
            <div key={task.id} className="widget-task-item">
              <div className="widget-task-meta">
                <span className={`badge badge-${task.priority === 'critical' ? 'red' : task.priority === 'high' ? 'amber' : 'cyan'}`}>
                  {task.priority.toUpperCase()}
                </span>
                <span className="widget-task-skill font-code text-muted">{task.skill}</span>
              </div>
              <div className="widget-task-title">{task.title}</div>
              <div className="progress-bar">
                <div
                  className="progress-fill progress-fill--gradient"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <span className="widget-task-pct font-code text-muted">{task.progress}%</span>
            </div>
          ))}
        </div>
      )}

      {backlog > 0 && (
        <div className="widget-task-footer font-code text-muted">
          +{backlog} in backlog
        </div>
      )}
    </section>
  );
}
