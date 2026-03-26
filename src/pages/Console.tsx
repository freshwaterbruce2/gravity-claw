import { useEffect, useRef, useState } from 'react';
import { useLogStore, type LogLevel } from '../stores/logStore';
import './Console.css';

function ts(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Console() {
  const { logs, clearLogs } = useLogStore();
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);

  const filtered = filter === 'ALL' ? logs : logs.filter((l) => l.level === filter);
  const levelCount = (l: LogLevel) => logs.filter((e) => e.level === l).length;

  return (
    <div className="console-page animate-in">
      {/* Toolbar */}
      <div className="console-toolbar">
        <div className="flex items-center gap-2">
          <span className="section-title">▶ AGENT CONSOLE</span>
          <span className="badge badge-green">LIVE</span>
        </div>
        <div className="console-filters">
          {(['ALL', 'INFO', 'SKILL', 'WARN', 'ERROR', 'DEBUG'] as const).map((l) => (
            <button
              key={l}
              className={`filter-btn ${filter === l ? 'filter-btn--active' : ''} filter-btn--${l.toLowerCase()}`}
              onClick={() => setFilter(l)}
            >
              {l} {l !== 'ALL' && <span className="filter-count">{levelCount(l as LogLevel)}</span>}
            </button>
          ))}
        </div>
        <div className="console-actions">
          <label className="autoscroll-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span className="font-code text-xs text-muted">AUTO-SCROLL</span>
          </label>
          <button
            className="btn btn-ghost"
            style={{ height: 28, fontSize: 11 }}
            onClick={clearLogs}
          >
            CLEAR
          </button>
        </div>
      </div>

      {/* Log output */}
      <div className="console-output">
        {filtered.map((entry) => (
          <div key={entry.id} className={`log-entry log-entry--${entry.level.toLowerCase()}`}>
            <span className="log-ts font-code">{ts(entry.timestamp)}</span>
            <span className={`log-level log-level--${entry.level.toLowerCase()}`}>
              {entry.level}
            </span>
            {entry.source && <span className="log-source font-code">{entry.source}</span>}
            <span className="log-message">{entry.message}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="console-empty font-code text-muted">
            {logs.length === 0
              ? 'Waiting for log events from backend...'
              : `No ${filter} entries.`}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
