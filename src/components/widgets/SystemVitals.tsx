import { useMetricsStore } from '../../stores/metricsStore';
import './SystemVitals.css';

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const h = 20;
  const w = 80;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={points}
        fill="none"
        stroke={`var(--${color})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatBytes(bytes: number) {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)}G`;
}

export default function SystemVitals() {
  const { cpu, memUsed, memTotal, cpuHistory, memHistory } = useMetricsStore();
  const memPct = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;

  function thresholdColor(pct: number) {
    if (pct > 85) return 'red';
    if (pct > 60) return 'amber';
    return 'green';
  }

  return (
    <div className="system-vitals">
      <div className="vital-item">
        <div className="vital-header">
          <span className="vital-label font-code">CPU</span>
          <span className={`vital-value font-code text-${thresholdColor(cpu)}`}>
            {Math.round(cpu)}%
          </span>
        </div>
        <div className="vital-bar">
          <div
            className={`vital-fill vital-fill--${thresholdColor(cpu)}`}
            style={{ width: `${cpu}%` }}
          />
        </div>
        <Sparkline data={cpuHistory} color={thresholdColor(cpu)} />
      </div>
      <div className="vital-item">
        <div className="vital-header">
          <span className="vital-label font-code">MEM</span>
          <span className={`vital-value font-code text-${thresholdColor(memPct)}`}>
            {memPct}%
          </span>
        </div>
        <div className="vital-bar">
          <div
            className={`vital-fill vital-fill--${thresholdColor(memPct)}`}
            style={{ width: `${memPct}%` }}
          />
        </div>
        <Sparkline data={memHistory} color={thresholdColor(memPct)} />
      </div>
      <div className="vital-meta font-code text-muted">
        {formatBytes(memUsed)} / {formatBytes(memTotal)}
      </div>
    </div>
  );
}
