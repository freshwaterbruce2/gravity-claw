import type { Page } from '../../App';
import { buildApiUrl } from '../../lib/runtime';
import { useIntegrationStore } from '../../stores/integrationStore';
import { useSkillsStore } from '../../stores/skillsStore';
import { useTaskStore } from '../../stores/taskStore';

interface QuickActionsWidgetProps {
  onNavigate: (page: Page) => void;
}

const ACTIONS = [
  { label: 'New Chat', icon: '◉', page: 'chat' as const, color: 'green' },
  { label: 'Task Board', icon: '▦', page: 'tasks' as const, color: 'amber' },
  { label: 'Refresh Tools', icon: '↻', action: 'refresh-tools' as const, color: 'cyan' },
  { label: 'Sync Ops', icon: '◎', action: 'sync-ops' as const, color: 'blue' },
  { label: 'Settings', icon: '⚙', page: 'settings' as const, color: 'muted' },
] as const;

export default function QuickActionsWidget({ onNavigate }: QuickActionsWidgetProps) {
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const loadSkills = useSkillsStore((state) => state.loadSkills);
  const loadIntegrations = useIntegrationStore((state) => state.loadIntegrations);

  const handleAction = async (
    action: (typeof ACTIONS)[number]
  ) => {
    if ('page' in action) {
      onNavigate(action.page);
      return;
    }

    if (action.action === 'refresh-tools') {
      await fetch(buildApiUrl('/api/refresh-tools'), { method: 'POST' });
      return;
    }

    await Promise.allSettled([
      loadTasks({ force: true }),
      loadSkills({ force: true }),
      loadIntegrations({ force: true }),
    ]);
  };

  return (
    <div className="widget-actions">
      <div className="widget-action-grid">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            className="widget-action-btn"
            type="button"
            onClick={() => {
              void handleAction(a);
            }}
          >
            <span className={`widget-action-icon text-${a.color}`}>{a.icon}</span>
            <span className="widget-action-label">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
