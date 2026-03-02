import { useEffect, useState } from 'react';
import { formatUptime, useAgentStore } from '../../stores/agentStore';
import './Sidebar.css';

type Page = 'dashboard' | 'chat' | 'skills' | 'tasks' | 'console' | 'settings';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const NAV_ITEMS: { id: Page; icon: string; label: string }[] = [
  { id: 'dashboard', icon: '◈', label: 'Dashboard' },
  { id: 'chat', icon: '◉', label: 'Chat' },
  { id: 'skills', icon: '⬡', label: 'Skills' },
  { id: 'tasks', icon: '▦', label: 'Tasks' },
  { id: 'console', icon: '▶', label: 'Console' },
  { id: 'settings', icon: '◌', label: 'Settings' },
];

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { status, name, uptime, skillCount } = useAgentStore();
  const [uptimeDisplay, setUptimeDisplay] = useState(formatUptime(uptime));

  useEffect(() => {
    setUptimeDisplay(formatUptime(uptime));
  }, [uptime]);

  const statusLabel =
    status === 'online'
      ? 'ONLINE'
      : status === 'idle'
        ? 'IDLE'
        : status === 'busy'
          ? 'BUSY'
          : 'OFFLINE';

  const statusClass = status === 'online' ? 'green' : status === 'busy' ? 'amber' : 'muted';

  return (
    <aside className="sidebar animate-in-left">
      {/* Logo / Branding */}
      <div className="sidebar-brand">
        <div className="brand-icon">🦀</div>
        <div className="brand-text">
          <span className="brand-name">GRAVITY-CLAW</span>
          <span className="brand-version font-code text-muted">v0.1.0</span>
        </div>
      </div>

      {/* Agent Status Block */}
      <div className="agent-status-block">
        <div className="agent-status-row">
          <span
            className={`dot dot-${statusClass}${statusClass === 'green' ? ' pulse-green' : ''}`}
          />
          <span className="font-code text-xs text-secondary">{name}</span>
        </div>
        <div className="agent-status-badge">
          <span
            className={`badge badge-${statusClass === 'green' ? 'green' : statusClass === 'amber' ? 'amber' : 'muted'}`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="agent-meta font-code text-xs text-muted">
          <span>⏱ {uptimeDisplay}</span>
          <span>⬡ {skillCount} skills</span>
        </div>
      </div>

      <div className="divider" style={{ margin: '0' }} />

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="section-title" style={{ padding: '0 12px', marginBottom: '8px' }}>
          NAVIGATION
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'nav-item--active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {currentPage === item.id && <span className="nav-indicator" />}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="font-code text-xs text-muted" style={{ lineHeight: 1.8 }}>
          <div>◈ INSPIRED BY OPENCLAW</div>
          <div>◉ VIBE-TECH MONOREPO</div>
        </div>
      </div>
    </aside>
  );
}
