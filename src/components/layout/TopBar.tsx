import SystemVitals from '../widgets/SystemVitals';
import { useAgentStore } from '../../stores/agentStore';
import { useTaskStore } from '../../stores/taskStore';
import './TopBar.css';

type Page = 'dashboard' | 'chat' | 'skills' | 'tasks' | 'console' | 'settings';

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'COMMAND CENTER',
  chat: 'AGENT CHAT',
  skills: 'SKILL BROWSER',
  tasks: 'TASK BOARD',
  console: 'AGENT CONSOLE',
  settings: 'CONFIGURATION',
};

export default function TopBar({ currentPage }: { currentPage: Page }) {
  const { model, messageCount } = useAgentStore();
  const { tasks } = useTaskStore();
  const runningTasks = tasks.filter((t) => t.status === 'running').length;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-tag">◈</span>
        <span className="topbar-title">{PAGE_TITLES[currentPage]}</span>
      </div>

      <div className="topbar-right">
        <SystemVitals />
        <div className="topbar-divider" />
        <div className="topbar-stat">
          <span className="topbar-stat-label">MODEL</span>
          <span className="topbar-stat-value">{model}</span>
        </div>
        <div className="topbar-divider" />
        <div className="topbar-stat">
          <span className="topbar-stat-label">TASKS RUNNING</span>
          <span className="topbar-stat-value text-amber">{runningTasks}</span>
        </div>
        <div className="topbar-divider" />
        <div className="topbar-stat">
          <span className="topbar-stat-label">MESSAGES</span>
          <span className="topbar-stat-value">{messageCount}</span>
        </div>
        <div className="topbar-dot-group">
          <span className="dot dot-green pulse-green" />
        </div>
      </div>
    </header>
  );
}
