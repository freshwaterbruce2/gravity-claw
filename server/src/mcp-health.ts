import type { EventBus } from './event-bus.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface McpServerHealth {
  server: string;
  status: 'online' | 'offline' | 'degraded';
  toolCount: number;
  latencyMs: number;
  lastChecked: number;
}

export async function fetchMcpHealth(): Promise<McpServerHealth[]> {
  const results: McpServerHealth[] = [];

  try {
    const serversRes = await fetch(`${MCP_GATEWAY_URL}/servers`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!serversRes.ok) {
      return results;
    }

    const servers: string[] = await serversRes.json() as string[];

    const checks = servers.map(async (server): Promise<McpServerHealth> => {
      const start = Date.now();
      try {
        const toolsRes = await fetch(`${MCP_GATEWAY_URL}/servers/${encodeURIComponent(server)}/tools`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        const latencyMs = Date.now() - start;

        if (!toolsRes.ok) {
          return { server, status: 'offline', toolCount: 0, latencyMs, lastChecked: Date.now() };
        }

        const tools = (await toolsRes.json()) as unknown[];
        const status = latencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'online';
        return { server, status, toolCount: tools.length, latencyMs, lastChecked: Date.now() };
      } catch {
        return { server, status: 'offline', toolCount: 0, latencyMs: Date.now() - start, lastChecked: Date.now() };
      }
    });

    results.push(...(await Promise.all(checks)));
  } catch {
    // Gateway itself is unreachable — return an empty list.
  }

  return results;
}

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;
const MCP_GATEWAY_URL = 'http://localhost:3100';
const FETCH_TIMEOUT_MS = 10_000;
const DEGRADED_LATENCY_MS = 5_000;

// ── Poller ───────────────────────────────────────────────────────────────────

export function startMcpHealthPoller(
  bus: EventBus,
  onUpdate?: (results: McpServerHealth[]) => void | Promise<void>
): { stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  async function poll() {
    if (stopped) return;
    if (bus.subscriberCount === 0) return; // idle when no SSE clients

    const results = await fetchMcpHealth();
    bus.emit('mcp.status', results);
    await onUpdate?.(results);
  }

  timer = setInterval(poll, POLL_INTERVAL_MS);
  // Run first poll immediately
  poll();

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
