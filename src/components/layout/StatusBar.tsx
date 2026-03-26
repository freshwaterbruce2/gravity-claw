import type { ConnectionStatus } from '../../hooks/useEventStream';
import { useAgentStore } from '../../stores/agentStore';
import { useMcpStore } from '../../stores/mcpStore';
import { useMetricsStore } from '../../stores/metricsStore';
import { useTaskStore } from '../../stores/taskStore';
import './StatusBar.css';

const CONNECTION_LABELS: Record<ConnectionStatus, { label: string; color: string }> = {
  connecting: { label: 'CONNECTING', color: 'amber' },
  connected: { label: 'SSE LIVE', color: 'green' },
  reconnecting: { label: 'RECONNECTING', color: 'amber' },
  error: { label: 'DISCONNECTED', color: 'red' },
};

export default function StatusBar({ connectionStatus }: { connectionStatus: ConnectionStatus }) {
  const { model } = useAgentStore();
  const { servers } = useMcpStore();
  const { cpu, memUsed, memTotal } = useMetricsStore();
  const { tasks } = useTaskStore();

  const online = servers.filter((s) => s.status === 'online').length;
  const memPct = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
  const runningTasks = tasks.filter((t) => t.status === 'running').length;

  const conn = CONNECTION_LABELS[connectionStatus];

  return (
    <footer className="statusbar">
      {/* SSE connection */}
      <div className="statusbar-item statusbar-connection">
        <span className={`dot dot-${conn.color}${connectionStatus === 'connected' ? ' pulse-green' : ''}`} />
        <span className={`statusbar-value text-${conn.color}`}>{conn.label}</span>
      </div>

      <span className="statusbar-sep" />

      {/* MCP servers */}
      <div className="statusbar-item">
        <span>MCP</span>
        <span className={`statusbar-value text-${online === servers.length && servers.length > 0 ? 'green' : 'amber'}`}>
          {servers.length > 0 ? `${online}/${servers.length}` : '--'}
        </span>
      </div>

      <span className="statusbar-sep" />

      {/* CPU */}
      <div className="statusbar-item">
        <span>CPU</span>
        <span className={`statusbar-value text-${cpu > 85 ? 'red' : cpu > 60 ? 'amber' : 'green'}`}>
          {Math.round(cpu)}%
        </span>
      </div>

      <span className="statusbar-sep" />

      {/* MEM */}
      <div className="statusbar-item">
        <span>MEM</span>
        <span className={`statusbar-value text-${memPct > 85 ? 'red' : memPct > 60 ? 'amber' : 'green'}`}>
          {memPct}%
        </span>
      </div>

      <span className="statusbar-sep" />

      {/* Tasks */}
      <div className="statusbar-item">
        <span>TASKS</span>
        <span className={`statusbar-value ${runningTasks > 0 ? 'text-amber' : 'text-muted'}`}>
          {runningTasks}
        </span>
      </div>

      <span className="statusbar-spacer" />

      {/* Model */}
      <div className="statusbar-item">
        <span className="statusbar-value">{model}</span>
      </div>
    </footer>
  );
}
