import type { Page } from '../App';
import { SKILLS } from '../data/skills';
import { formatUptime, useAgentStore, type ActivityItem } from '../stores/agentStore';
import { useChatStore } from '../stores/chatStore';
import { useTaskStore } from '../stores/taskStore';
import './Dashboard.css';

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

function ActivityIcon({ type }: { type: ActivityItem['type'] }) {
  const icons = { task: '✓', skill: '⬡', error: '⚠', message: '◉', system: '◈' } as const;
  const classes = {
    task: 'green',
    skill: 'amber',
    error: 'red',
    message: 'blue',
    system: 'muted',
  } as const;
  return <span className={`activity-icon activity-icon--${classes[type]}`}>{icons[type]}</span>;
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

const QUICKSKILLS = [
  'Web Search',
  'Email Manager',
  'Code Writer',
  'Deep Researcher',
  'Calendar Manager',
  'Reminder Bot',
];

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { uptime, messageCount, taskCount, skillCount, activities } = useAgentStore();
  const { tasks } = useTaskStore();
  const { messages } = useChatStore();

  const runningTasks = tasks.filter((t) => t.status === 'running').length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const activeSkills = SKILLS.filter((s) => s.status === 'active').length;

  const STATS = [
    {
      label: 'ACTIVE TASKS',
      value: String(runningTasks),
      icon: '▦',
      color: 'amber',
      onClick: () => onNavigate('tasks'),
    },
    {
      label: 'SKILLS LOADED',
      value: String(skillCount),
      icon: '⬡',
      color: 'cyan',
      onClick: () => onNavigate('skills'),
    },
    {
      label: 'MSGS TODAY',
      value: String(messages.length + messageCount),
      icon: '◉',
      color: 'green',
      onClick: () => onNavigate('chat'),
    },
    { label: 'UPTIME', value: formatUptime(uptime), icon: '⏱', color: 'muted', onClick: undefined },
  ];

  return (
    <div className="dashboard animate-in">
      {/* Stat Cards */}
      <div className="stat-grid">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className={`stat-card ${stat.onClick ? 'stat-card--clickable' : ''}`}
            onClick={stat.onClick}
          >
            <div className="stat-card-top">
              <span className={`stat-icon text-${stat.color}`}>{stat.icon}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
            <div className={`stat-value text-${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Main Row */}
      <div className="dashboard-row">
        {/* Activity Feed */}
        <section className="card activity-feed">
          <div className="section-header">
            <span className="section-title">◉ LIVE ACTIVITY</span>
            <span className="badge badge-green">LIVE</span>
          </div>
          <div className="activity-list">
            {activities.slice(0, 12).map((item) => (
              <div key={item.id} className="activity-item">
                <ActivityIcon type={item.type} />
                <div className="activity-content">
                  <span className="activity-message">{item.message}</span>
                  {item.skill && <span className="tag">{item.skill}</span>}
                </div>
                <span className="activity-time font-code text-muted">
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Right column */}
        <div className="dashboard-right">
          {/* System Health */}
          <section className="card system-health">
            <div className="section-header">
              <span className="section-title">◈ SYSTEM STATUS</span>
            </div>
            <div className="health-rows">
              {[
                { label: 'Agent Core', value: 100, color: 'green', status: 'NOMINAL' },
                { label: 'Gravity Engine', value: useAgentStore().gravityMechanicEnabled ? 100 : 0, color: useAgentStore().gravityMechanicEnabled ? 'cyan' : 'muted', status: useAgentStore().gravityMechanicEnabled ? 'ACTIVE' : 'OFFLINE' },
                { label: 'Bee Memory', value: useAgentStore().beeMemoryEnabled ? 95 : 0, color: useAgentStore().beeMemoryEnabled ? 'amber' : 'muted', status: useAgentStore().beeMemoryEnabled ? 'SYNCED' : 'OFFLINE' },
                { label: 'OAuth Loophole', value: 100, color: 'green', status: useAgentStore().oauthLoopholeEmail },
                {
                  label: 'Skill engine',
                  value: 100,
                  color: 'green',
                  status: `${activeSkills} loaded`,
                },
                { label: 'Messaging bus', value: 73, color: 'amber', status: 'CONNECTED' },
                {
                  label: 'Tasks done',
                  value: Math.round((doneTasks / Math.max(taskCount, 1)) * 100),
                  color: 'cyan',
                  status: `${doneTasks}/${taskCount}`,
                },
              ].map((row) => (
                <div key={row.label} className="health-row">
                  <div className="health-row-meta">
                    <span className="health-label">{row.label}</span>
                    <span className={`health-status text-${row.color} font-code`}>
                      {row.status}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill progress-fill--${row.color}`}
                      style={{ width: `${row.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Quick Skills */}
          <section className="card quick-skills">
            <div className="section-header">
              <span className="section-title">⬡ QUICK SKILLS</span>
              <button
                className="btn btn-ghost"
                style={{ height: 26, fontSize: 11 }}
                onClick={() => onNavigate('skills')}
              >
                View all
              </button>
            </div>
            <div className="quick-skill-grid">
              {QUICKSKILLS.map((name) => {
                const skill = SKILLS.find((s) => s.name === name);
                if (!skill) return null;
                return (
                  <button key={name} className="quick-skill-btn" onClick={() => onNavigate('chat')}>
                    <span className="quick-skill-icon">{skill.icon}</span>
                    <span className="quick-skill-name">{skill.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
