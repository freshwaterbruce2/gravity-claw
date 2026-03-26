import type { Page } from '../App';
import ActiveTasksWidget from '../components/widgets/ActiveTasksWidget';
import FeatureTogglesWidget from '../components/widgets/FeatureTogglesWidget';
import HeroVitalsWidget from '../components/widgets/HeroVitalsWidget';
import LogSeverityWidget from '../components/widgets/LogSeverityWidget';
import McpStatusGrid from '../components/widgets/McpStatusGrid';
import QuickActionsWidget from '../components/widgets/QuickActionsWidget';
import RecentChatWidget from '../components/widgets/RecentChatWidget';
import SkillCategoriesWidget from '../components/widgets/SkillCategoriesWidget';
import { useAgentStore, type ActivityItem } from '../stores/agentStore';
import { useIntegrationStore } from '../stores/integrationStore';
import { useSkillsStore } from '../stores/skillsStore';
import { useTaskStore } from '../stores/taskStore';
import './Dashboard.css';

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

function ActivityIcon({ type }: { type: ActivityItem['type'] }) {
  const icons = { task: '\u2713', skill: '\u2B21', error: '\u26A0', message: '\u25C9', system: '\u25C8' } as const;
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

function integrationTone(status: string) {
  if (status === 'online') return 'green';
  if (status === 'degraded' || status === 'configured' || status === 'connecting') return 'amber';
  return 'muted';
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { activities } = useAgentStore();
  const tasks = useTaskStore((state) => state.tasks);
  const integrations = useIntegrationStore((state) => state.integrations);
  const skills = useSkillsStore((state) => state.skills);
  const runningTasks = tasks.filter((task) => task.status === 'running');
  const backlogTasks = tasks.filter((task) => task.status === 'backlog');
  const completedTasks = tasks.filter((task) => task.status === 'done');
  const visibleTasks = [...runningTasks, ...backlogTasks].slice(0, 4);
  const onlineIntegrations = integrations.filter((item) => item.status === 'online').length;
  const degradedIntegrations = integrations.filter((item) => item.status === 'degraded').length;
  const disabledIntegrations = integrations.filter((item) => item.status === 'disabled').length;
  const activeSkills = skills.filter((skill) => skill.status === 'active').length;

  return (
    <div className="dashboard bento-grid">
      <section className="bento-control bento-card bento-card--hero">
        <div className="section-header">
          <span className="section-title">CONTROL STRIP</span>
          <span className="badge badge-green">LIVE DATA</span>
        </div>
        <div className="ops-control-strip">
          <div className="ops-control-main">
            <HeroVitalsWidget />
          </div>
          <div className="ops-control-actions">
            <div className="ops-subsection">
              <span className="section-title">QUICK ACTIONS</span>
              <QuickActionsWidget onNavigate={onNavigate} />
            </div>
            <div className="ops-overview-grid">
              <div className="ops-stat-card">
                <span className="ops-stat-label">QUEUE</span>
                <strong className="ops-stat-value">{tasks.length}</strong>
                <span className="ops-stat-hint">{runningTasks.length} running now</span>
              </div>
              <div className="ops-stat-card">
                <span className="ops-stat-label">SKILLS</span>
                <strong className="ops-stat-value">{skills.length}</strong>
                <span className="ops-stat-hint">{activeSkills} active through MCP</span>
              </div>
              <div className="ops-stat-card">
                <span className="ops-stat-label">CHANNELS</span>
                <strong className="ops-stat-value">{integrations.length}</strong>
                <span className="ops-stat-hint">{onlineIntegrations} online</span>
              </div>
              <div className="ops-stat-card">
                <span className="ops-stat-label">ATTENTION</span>
                <strong className="ops-stat-value">{degradedIntegrations}</strong>
                <span className="ops-stat-hint">{disabledIntegrations} disabled</span>
              </div>
            </div>
          </div>
          <div className="ops-control-toggles">
            <FeatureTogglesWidget />
          </div>
        </div>
      </section>

      <section className="bento-workqueue bento-card bento-card--primary">
        <div className="section-header">
          <span className="section-title">WORK QUEUE</span>
          <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }} onClick={() => onNavigate('tasks')}>
            Open board
          </button>
        </div>
        <div className="ops-workqueue-grid">
          <div className="ops-workqueue-main">
            <ActiveTasksWidget onNavigate={onNavigate} />
          </div>
          <div className="ops-workqueue-side">
            <div className="ops-inline-badges">
              <span className="badge badge-amber">{runningTasks.length} RUNNING</span>
              <span className="badge badge-cyan">{backlogTasks.length} BACKLOG</span>
              <span className="badge badge-green">{completedTasks.length} DONE</span>
            </div>
            <div className="ops-task-focus-list">
              {visibleTasks.length === 0 ? (
                <div className="widget-empty">No queued work yet</div>
              ) : (
                visibleTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="ops-task-focus"
                    onClick={() => onNavigate('tasks')}
                  >
                    <div className="ops-task-focus-top">
                      <span className={`badge badge-${task.priority === 'critical' ? 'red' : task.priority === 'high' ? 'amber' : task.priority === 'medium' ? 'cyan' : 'muted'}`}>
                        {task.priority.toUpperCase()}
                      </span>
                      <span className="font-code text-muted text-xs">{task.skill}</span>
                    </div>
                    <div className="ops-task-focus-title">{task.title}</div>
                    <div className="progress-bar">
                      <div className="progress-fill progress-fill--gradient" style={{ width: `${task.progress}%` }} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bento-integrations bento-card bento-card--primary">
        <div className="section-header">
          <span className="section-title">INTEGRATIONS HEALTH</span>
          <span className={`badge ${degradedIntegrations > 0 ? 'badge-amber' : 'badge-green'}`}>
            {onlineIntegrations}/{integrations.length || 0} ONLINE
          </span>
        </div>
        <div className="ops-integrations-grid">
          <div className="ops-integrations-list">
            {integrations.length === 0 ? (
              <div className="widget-empty">Waiting for integration telemetry...</div>
            ) : (
              integrations.map((integration) => (
                <div
                  key={integration.id}
                  className={`integration-card integration-card--${integrationTone(integration.status)}`}
                >
                  <div className="integration-card-top">
                    <span className="integration-name">{integration.name}</span>
                    <span className={`badge badge-${integrationTone(integration.status)}`}>
                      {integration.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="integration-details">{integration.details ?? integration.health ?? 'No details reported yet.'}</div>
                  <div className="integration-meta">
                    {typeof integration.toolCount === 'number' && integration.toolCount > 0 && (
                      <span>{integration.toolCount} tools</span>
                    )}
                    {typeof integration.latencyMs === 'number' && integration.latencyMs > 0 && (
                      <span>{integration.latencyMs}ms</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="ops-integrations-mcp">
            <McpStatusGrid />
          </div>
        </div>
      </section>

      <section className="bento-visibility bento-card bento-card--secondary">
        <div className="section-header">
          <span className="section-title">VISIBILITY STREAM</span>
          <span className="badge badge-muted">OPS VIEW</span>
        </div>
        <div className="ops-visibility-grid">
          <div className="ops-activity-panel">
            <div className="section-header">
              <span className="section-title">LIVE ACTIVITY</span>
              <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }} onClick={() => onNavigate('chat')}>
                Open chat
              </button>
            </div>
            <div className="activity-list">
              {activities.slice(0, 16).map((item) => (
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
          </div>
          <div className="ops-visibility-side">
            <div className="ops-visibility-card">
              <SkillCategoriesWidget onNavigate={onNavigate} />
            </div>
            <div className="ops-visibility-card">
              <RecentChatWidget onNavigate={onNavigate} />
            </div>
            <div className="ops-visibility-card">
              <LogSeverityWidget onNavigate={onNavigate} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
