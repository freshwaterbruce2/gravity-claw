import { useMetricsStore } from '../../stores/metricsStore';
import { formatUptime, useAgentStore } from '../../stores/agentStore';

function thresholdColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct > 85) return 'red';
  if (pct > 60) return 'amber';
  return 'green';
}

/* ── Ring Gauge ─────────────────────────────────────────────── */

const RADIUS = 38;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~238.76

function RingGauge({ pct, label }: { pct: number; label: string }) {
  const color = thresholdColor(pct);
  const dashArray = `${(pct / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;

  return (
    <div className="hero-gauge">
      <svg
        className="ring-gauge"
        width={88}
        height={88}
        viewBox="0 0 88 88"
        aria-label={`${label} usage ${Math.round(pct)} percent`}
      >
        <circle
          className="ring-track"
          cx={44}
          cy={44}
          r={RADIUS}
          fill="none"
          stroke="var(--bg-hover)"
          strokeWidth={6}
        />
        <circle
          className="ring-fill"
          cx={44}
          cy={44}
          r={RADIUS}
          fill="none"
          stroke={`var(--${color})`}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          strokeDashoffset={0}
          transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
        />
        <text
          className="ring-text"
          x={44}
          y={44}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-primary)"
          fontSize={18}
          fontWeight={700}
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <span className="hero-gauge-label font-code">{label}</span>
    </div>
  );
}

/* ── Sparkline with gradient fill ──────────────────────────── */

function HeroSparkline({
  data,
  color,
  id,
}: {
  data: number[];
  color: string;
  id: string;
}) {
  if (data.length < 2) return null;

  const w = 140;
  const h = 32;
  const max = Math.max(...data, 1);

  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');

  // Close the polygon along the bottom edge for the gradient fill
  const firstX = 0;
  const lastX = (data.length - 1) > 0
    ? ((data.length - 1) / (data.length - 1)) * w
    : 0;
  const fillPoints = `${points} ${lastX},${h} ${firstX},${h}`;

  const gradientId = `spark-fill-${id}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`var(--${color})`} stopOpacity={0.4} />
          <stop offset="100%" stopColor={`var(--${color})`} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={fillPoints}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={`var(--${color})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Status badge class ────────────────────────────────────── */

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'online':
      return 'badge badge-green';
    case 'busy':
    case 'idle':
      return 'badge badge-amber';
    case 'offline':
      return 'badge badge-red';
    default:
      return 'badge';
  }
}

/* ── HeroVitalsWidget ──────────────────────────────────────── */

export default function HeroVitalsWidget() {
  const { cpu, memUsed, memTotal, cpuHistory, memHistory } = useMetricsStore();
  const { name, model, status, uptime } = useAgentStore();

  const memPct = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
  const cpuColor = thresholdColor(cpu);
  const memColor = thresholdColor(memPct);

  return (
    <div className="hero-vitals">
      {/* ── Left: Gauges + Sparklines ── */}
      <div className="hero-gauges">
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <RingGauge pct={cpu} label="CPU" />
          <RingGauge pct={memPct} label="MEM" />
        </div>

        <div className="hero-sparklines">
          <HeroSparkline data={cpuHistory} color={cpuColor} id="cpu" />
          <HeroSparkline data={memHistory} color={memColor} id="mem" />
        </div>
      </div>

      {/* ── Right: Agent Info ── */}
      <div className="hero-info">
        <span className="hero-agent-name font-code text-amber">{name}</span>
        <span className="hero-model font-code text-muted">{model}</span>
        <span className="hero-uptime font-code text-3xl">{formatUptime(uptime)}</span>
        <span className={statusBadgeClass(status)}>{status}</span>
      </div>
    </div>
  );
}
