import { EventEmitter } from 'node:events';

// ── Event Types ──────────────────────────────────────────────────────────────

export type EventKind =
  | 'system.metrics'
  | 'mcp.status'
  | 'agent.activity'
  | 'task.update'
  | 'integration.status'
  | 'config.update'
  | 'log.entry'
  | 'notification';

export interface BusEvent {
  kind: EventKind;
  data: unknown;
  ts: number;
}

export type BusHandler = (event: BusEvent) => void;

// ── EventBus ─────────────────────────────────────────────────────────────────

export interface EventBus {
  /** Emit a typed event to all subscribers and update the snapshot. */
  emit(kind: EventKind, data: unknown): void;
  /** Register a handler that receives every event. */
  subscribe(handler: BusHandler): void;
  /** Remove a previously registered handler. */
  unsubscribe(handler: BusHandler): void;
  /** Number of currently connected subscribers (SSE clients). */
  readonly subscriberCount: number;
  /** Latest snapshot per event kind — sent to new SSE clients on connect. */
  getSnapshot(): Map<string, unknown>;
}

export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(200); // allow many SSE clients

  const handlers = new Set<BusHandler>();
  const lastSnapshot = new Map<string, unknown>();

  return {
    emit(kind: EventKind, data: unknown) {
      const event: BusEvent = { kind, data, ts: Date.now() };
      lastSnapshot.set(kind, data);
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // swallow handler errors so one bad client never breaks others
        }
      }
    },

    subscribe(handler: BusHandler) {
      handlers.add(handler);
    },

    unsubscribe(handler: BusHandler) {
      handlers.delete(handler);
    },

    get subscriberCount() {
      return handlers.size;
    },

    getSnapshot() {
      return lastSnapshot;
    },
  };
}
