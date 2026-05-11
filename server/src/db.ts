/**
 * Persistent recording layer for Gravity-Claw.
 * Writes agent activity and log entries to D:\databases\agent_learning.db
 * (same DB as Nova Agent) and appends structured logs to D:\logs\gravity-claw\.
 *
 * All operations are non-fatal: if the DB is unavailable, recording silently
 * degrades to in-memory-only mode without crashing the server.
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentActivityRecord, LogEntryRecord } from './types-internal.js';

const DB_PATH = path.join('D:\\', 'databases', 'agent_learning.db');
const LOG_DIR = path.join('D:\\', 'logs', 'gravity-claw');

let db: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS activity_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT    NOT NULL,
    app_source  TEXT    NOT NULL DEFAULT 'gravity-claw',
    project_id  TEXT,
    payload     TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_executions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name      TEXT    NOT NULL DEFAULT 'gravity-claw',
    task_type       TEXT    NOT NULL,
    success         INTEGER NOT NULL DEFAULT 1,
    execution_time  INTEGER NOT NULL DEFAULT 0,
    error_details   TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_gc_activity_created  ON activity_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_gc_executions_created ON agent_executions(created_at);
`;

export function initDb(): void {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.mkdirSync(LOG_DIR, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(SCHEMA);

    console.log(`  [db] activity recording: ${DB_PATH}`);
    console.log(`  [db] log dir: ${LOG_DIR}`);
  } catch (err) {
    console.warn('[db] init failed — recording disabled:', err instanceof Error ? err.message : err);
    db = null;
  }
}

export function recordActivity(entry: AgentActivityRecord): void {
  if (!db) return;
  try {
    db.prepare(
      'INSERT INTO activity_events (event_type, app_source, project_id, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(
      entry.type,
      'gravity-claw',
      entry.server ?? null,
      JSON.stringify({ tool: entry.tool, durationMs: entry.durationMs }),
      entry.ts,
    );
  } catch { /* non-fatal */ }
}

export function recordExecution(
  taskType: string,
  durationMs: number,
  success: boolean,
  errorDetails?: string,
): void {
  if (!db) return;
  try {
    db.prepare(
      'INSERT INTO agent_executions (agent_name, task_type, success, execution_time, error_details, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('gravity-claw', taskType, success ? 1 : 0, durationMs, errorDetails ?? null, Date.now());
  } catch { /* non-fatal */ }
}

export function appendLog(entry: LogEntryRecord): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const today = new Date(entry.ts).toISOString().slice(0, 10);
    const logPath = path.join(LOG_DIR, `gravity-claw-${today}.log`);
    const line = JSON.stringify({ ...entry, ts: new Date(entry.ts).toISOString() }) + '\n';
    fs.appendFileSync(logPath, line);
  } catch { /* non-fatal */ }
}

export function closeDb(): void {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
}
