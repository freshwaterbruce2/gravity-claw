import { useMemo } from 'react';
import type { Page } from '../../App';
import { useLogStore, type LogLevel } from '../../stores/logStore';
import { formatRelativeTime } from '../../lib/time';

interface LogSeverityWidgetProps {
  onNavigate: (page: Page) => void;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  INFO: 'cyan',
  WARN: 'amber',
  ERROR: 'red',
  DEBUG: 'muted',
  SKILL: 'green',
};

const ALL_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'SKILL'];

export default function LogSeverityWidget({ onNavigate }: LogSeverityWidgetProps) {
  const { logs } = useLogStore();

  const counts = useMemo(() => {
    const map: Record<LogLevel, number> = {
      INFO: 0,
      WARN: 0,
      ERROR: 0,
      DEBUG: 0,
      SKILL: 0,
    };
    for (const log of logs) {
      map[log.level]++;
    }
    return map;
  }, [logs]);

  const recentLogs = useMemo(() => logs.slice(-5).reverse(), [logs]);

  return (
    <section className="card widget-log-severity">
      <div className="section-header">
        <span className="section-title">&#9638; LOG SEVERITY</span>
        <button
          type="button"
          className="btn btn-ghost btn-header-sm"
          onClick={() => onNavigate('console')}
        >
          View Console
        </button>
      </div>

      <div className="log-severity-badges">
        {ALL_LEVELS.map((level) => (
          <span
            key={level}
            className={`log-severity-badge log-severity-badge--${LEVEL_COLORS[level]}`}
          >
            {level} {counts[level]}
          </span>
        ))}
      </div>

      {recentLogs.length === 0 ? (
        <div className="widget-empty">No log entries</div>
      ) : (
        <div className="log-mini-console">
          {recentLogs.map((entry) => (
            <div key={entry.id} className="log-mini-entry">
              <span
                className={`log-mini-dot log-mini-dot--${LEVEL_COLORS[entry.level]}`}
              />
              <span className="log-mini-msg">{entry.message}</span>
              <span className="log-mini-time">
                {formatRelativeTime(entry.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
