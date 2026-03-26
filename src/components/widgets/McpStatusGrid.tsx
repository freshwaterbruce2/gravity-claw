import { useMcpStore, type McpServerStatus } from '../../stores/mcpStore';
import './McpStatusGrid.css';

function statusColor(s: McpServerStatus['status']) {
  return s === 'online' ? 'green' : s === 'degraded' ? 'amber' : 'red';
}

export default function McpStatusGrid() {
  const { servers } = useMcpStore();

  if (servers.length === 0) {
    return (
      <section className="card mcp-grid">
        <div className="section-header">
          <span className="section-title">MCP SERVERS</span>
          <span className="badge badge-muted">SCANNING</span>
        </div>
        <div className="mcp-empty font-code text-muted">Waiting for health data...</div>
      </section>
    );
  }

  const online = servers.filter((s) => s.status === 'online').length;
  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);

  return (
    <section className="card mcp-grid">
      <div className="section-header">
        <span className="section-title">MCP SERVERS</span>
        <span className={`badge ${online === servers.length ? 'badge-green' : 'badge-amber'}`}>
          {online}/{servers.length} ONLINE
        </span>
      </div>
      <div className="mcp-tool-summary font-code text-muted">
        {totalTools} tools across {servers.length} servers
      </div>
      <div className="mcp-server-list">
        {servers.map((s) => (
          <div
            key={s.server}
            className={`mcp-server-row mcp-server-row--${statusColor(s.status)}`}
          >
            <span
              className={`dot dot-${statusColor(s.status)}${s.status === 'online' ? ' pulse-green' : ''}`}
            />
            <span className="mcp-server-name font-code">{s.server}</span>
            <span className="mcp-server-tools font-code text-muted">{s.toolCount} tools</span>
            <span className={`mcp-server-latency font-code text-${statusColor(s.status)}`}>
              {s.status === 'offline' ? '---' : `${s.latencyMs}ms`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
