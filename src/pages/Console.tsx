import { useEffect, useRef, useState } from 'react';
import './Console.css';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'SKILL';

interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: Date;
  source?: string;
}

const SEED_LOGS: Omit<LogEntry, 'id'>[] = [
  {
    level: 'INFO',
    message: 'Gravity-Claw agent runtime v0.1.0 starting...',
    timestamp: new Date(Date.now() - 14400000),
    source: 'core',
  },
  {
    level: 'INFO',
    message: 'Loading skill manifests from registry...',
    timestamp: new Date(Date.now() - 14395000),
    source: 'skill-engine',
  },
  {
    level: 'INFO',
    message: '34 skills loaded successfully.',
    timestamp: new Date(Date.now() - 14390000),
    source: 'skill-engine',
  },
  {
    level: 'INFO',
    message: 'Memory module initialized. Loaded 1,247 context entries.',
    timestamp: new Date(Date.now() - 14380000),
    source: 'memory',
  },
  {
    level: 'INFO',
    message: 'Telegram bridge connected. Listening for messages...',
    timestamp: new Date(Date.now() - 14370000),
    source: 'telegram',
  },
  {
    level: 'INFO',
    message: 'Discord bridge connected. Monitoring 3 servers.',
    timestamp: new Date(Date.now() - 14360000),
    source: 'discord',
  },
  {
    level: 'SKILL',
    message: '[WebSearch] Executed: "AI agent trends 2026" → 14 results',
    timestamp: new Date(Date.now() - 12000000),
    source: 'web-search',
  },
  {
    level: 'WARN',
    message: 'WhatsApp bridge: session token expires in 24h. Re-auth recommended.',
    timestamp: new Date(Date.now() - 11000000),
    source: 'whatsapp',
  },
  {
    level: 'SKILL',
    message: '[EmailManager] Draft generated: Weekly AI Digest → sent to 3 recipients',
    timestamp: new Date(Date.now() - 10000000),
    source: 'email',
  },
  {
    level: 'INFO',
    message: 'Memory checkpoint saved. 1,289 vectors stored.',
    timestamp: new Date(Date.now() - 8000000),
    source: 'memory',
  },
  {
    level: 'SKILL',
    message: '[CalendarManager] Event created: "Product Demo" on 2026-03-05 14:00',
    timestamp: new Date(Date.now() - 7000000),
    source: 'calendar',
  },
  {
    level: 'DEBUG',
    message: 'LLM token count: prompt=1,243 completion=412 total=1,655',
    timestamp: new Date(Date.now() - 6000000),
    source: 'llm',
  },
  {
    level: 'SKILL',
    message: '[GitManager] Committed: "feat: add auth middleware" → main',
    timestamp: new Date(Date.now() - 5000000),
    source: 'git',
  },
  {
    level: 'ERROR',
    message: 'BrowserControl: Navigation timeout after 30s on target URL. Retrying...',
    timestamp: new Date(Date.now() - 3000000),
    source: 'browser',
  },
  {
    level: 'SKILL',
    message: '[BrowserControl] Retry successful. Page loaded in 2.3s.',
    timestamp: new Date(Date.now() - 2900000),
    source: 'browser',
  },
  {
    level: 'INFO',
    message: 'Heartbeat check: all systems nominal.',
    timestamp: new Date(Date.now() - 600000),
    source: 'core',
  },
];

const LIVE_LOG_POOL: Omit<LogEntry, 'id' | 'timestamp'>[] = [
  {
    level: 'SKILL',
    message: '[WebSearch] Monitoring keyword "AI agent frameworks"',
    source: 'web-search',
  },
  { level: 'INFO', message: 'Memory: consolidating context from last 2 tasks', source: 'memory' },
  {
    level: 'SKILL',
    message: '[ReaderBot] Processing document: project_brief.pdf',
    source: 'file-reader',
  },
  { level: 'DEBUG', message: 'Token usage: 847 prompt / 312 completion', source: 'llm' },
  {
    level: 'SKILL',
    message: '[EmailManager] Checking inbox for flagged messages...',
    source: 'email',
  },
  { level: 'INFO', message: 'Scheduler: Next cron job in 4 minutes (digest)', source: 'scheduler' },
  {
    level: 'WARN',
    message: 'Rate limit approaching on web-search skill (87/100 req/hr)',
    source: 'web-search',
  },
  {
    level: 'SKILL',
    message: '[CodeWriter] Generated: useAuth.ts hook (47 lines)',
    source: 'code-writer',
  },
];

function ts(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Console() {
  const [logs, setLogs] = useState<LogEntry[]>(
    SEED_LOGS.map((l, i) => ({ ...l, id: `seed-${i}` })),
  );
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  let poolIdx = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const entry = LIVE_LOG_POOL[poolIdx.current % LIVE_LOG_POOL.length];
      poolIdx.current++;
      setLogs((prev) => [
        ...prev.slice(-200),
        { ...entry, id: `log-${Date.now()}`, timestamp: new Date() },
      ]);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

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
            onClick={() => setLogs([])}
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
          <div className="console-empty font-code text-muted">No {filter} entries.</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
