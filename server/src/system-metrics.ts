import * as os from 'node:os';
import type { EventBus } from './event-bus.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SystemMetricsData {
  cpu: number;       // 0-100 percentage
  memUsed: number;   // bytes
  memTotal: number;  // bytes
  uptime: number;    // seconds
}

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;

// ── CPU Delta Calculation ────────────────────────────────────────────────────

interface CpuSnapshot {
  idle: number;
  total: number;
}

let lastCpuSnapshot = takeCpuSnapshot();

function takeCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }

  return { idle, total };
}

function cpuPercent(prev: CpuSnapshot, curr: CpuSnapshot): number {
  const idleDelta = curr.idle - prev.idle;
  const totalDelta = curr.total - prev.total;
  if (totalDelta === 0) return 0;
  return Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
}

export function readSystemMetrics(): SystemMetricsData {
  const currSnapshot = takeCpuSnapshot();
  const cpu = cpuPercent(lastCpuSnapshot, currSnapshot);
  lastCpuSnapshot = currSnapshot;

  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;

  return {
    cpu,
    memUsed,
    memTotal,
    uptime: os.uptime(),
  };
}

// ── Collector ────────────────────────────────────────────────────────────────

export function startSystemMetrics(bus: EventBus): { stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  function collect() {
    if (stopped) return;
    if (bus.subscriberCount === 0) return; // idle when no SSE clients

    const data = readSystemMetrics();
    bus.emit('system.metrics', data);
  }

  timer = setInterval(collect, POLL_INTERVAL_MS);
  // Run first collection after one interval so CPU delta is meaningful
  // (first delta from boot time would be inaccurate)

  return {
    stop() {
      stopped = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
