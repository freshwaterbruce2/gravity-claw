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

const SCHEMA = {
  activity_events: `
    CREATE TABLE IF NOT EXISTS activity_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type  TEXT    NOT NULL,
      app_source  TEXT    NOT NULL DEFAULT 'gravity-claw',
      project_id  TEXT,
      payload     TEXT,
      created_at  INTEGER NOT NULL
    );
  `,
  agent_executions: `
    CREATE TABLE IF NOT EXISTS agent_executions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name      TEXT    NOT NULL DEFAULT 'gravity-claw',
      task_type       TEXT    NOT NULL,
      success         INTEGER NOT NULL DEFAULT 1,
      execution_time  INTEGER NOT NULL DEFAULT 0,
      error_details   TEXT,
      created_at      INTEGER NOT NULL
    );
  `,
  memory_vectors: `
    CREATE TABLE IF NOT EXISTS memory_vectors (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id     TEXT    NOT NULL,
      category      TEXT    NOT NULL,
      text          TEXT    NOT NULL,
      metadata      TEXT,
      embedding     TEXT,
      created_at    INTEGER NOT NULL
    );
  `,
};

function ensureColumns(tableName: string, requiredColumns: Array<{ name: string; alterSql: string }>): void {
  if (!db) return;

  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));

    for (const { name, alterSql } of requiredColumns) {
      if (!names.has(name)) {
        db.exec(alterSql);
      }
    }
  } catch { /* best effort migration */ }
}

function ensureIndex(tableName: string, columnName: string, indexName: string): void {
  if (!db) return;

  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    const hasColumn = columns.some((column) => column.name === columnName);
    if (!hasColumn) return;

    const quotedIndex = `idx_${tableName}_${columnName}`;
    const safeIndex = indexName || quotedIndex;
    db.exec(`CREATE INDEX IF NOT EXISTS ${safeIndex} ON ${tableName}(${columnName})`);
  } catch { /* best effort migration */ }
}

function ensureActivityColumns(): void {
  ensureColumns('activity_events', [
    { name: 'event_type', alterSql: 'ALTER TABLE activity_events ADD COLUMN event_type TEXT NOT NULL DEFAULT "generic"' },
    { name: 'app_source', alterSql: "ALTER TABLE activity_events ADD COLUMN app_source TEXT NOT NULL DEFAULT 'gravity-claw'" },
    { name: 'project_id', alterSql: 'ALTER TABLE activity_events ADD COLUMN project_id TEXT' },
    { name: 'payload', alterSql: 'ALTER TABLE activity_events ADD COLUMN payload TEXT' },
    { name: 'created_at', alterSql: 'ALTER TABLE activity_events ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0' },
  ]);
}

function ensureExecutionColumns(): void {
  ensureColumns('agent_executions', [
    { name: 'agent_name', alterSql: "ALTER TABLE agent_executions ADD COLUMN agent_name TEXT NOT NULL DEFAULT 'gravity-claw'" },
    { name: 'task_type', alterSql: 'ALTER TABLE agent_executions ADD COLUMN task_type TEXT NOT NULL DEFAULT "generic"' },
    { name: 'success', alterSql: 'ALTER TABLE agent_executions ADD COLUMN success INTEGER NOT NULL DEFAULT 1' },
    { name: 'execution_time', alterSql: 'ALTER TABLE agent_executions ADD COLUMN execution_time INTEGER NOT NULL DEFAULT 0' },
    { name: 'error_details', alterSql: 'ALTER TABLE agent_executions ADD COLUMN error_details TEXT' },
    { name: 'created_at', alterSql: 'ALTER TABLE agent_executions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0' },
  ]);
}

function ensureMemoryVectorColumns(): void {
  ensureColumns('memory_vectors', [
    { name: 'source_id', alterSql: 'ALTER TABLE memory_vectors ADD COLUMN source_id TEXT NOT NULL DEFAULT "gravity-claw"' },
    { name: 'category', alterSql: 'ALTER TABLE memory_vectors ADD COLUMN category TEXT NOT NULL DEFAULT "semantic"' },
    { name: 'text', alterSql: 'ALTER TABLE memory_vectors ADD COLUMN text TEXT NOT NULL DEFAULT ""' },
    { name: 'metadata', alterSql: 'ALTER TABLE memory_vectors ADD COLUMN metadata TEXT' },
    { name: 'embedding', alterSql: 'ALTER TABLE memory_vectors ADD COLUMN embedding TEXT' },
    { name: 'created_at', alterSql: 'ALTER TABLE memory_vectors ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0' },
  ]);
}

function ensureMemoryVectorIndexes(): void {
  ensureIndex('memory_vectors', 'source_id', 'idx_memory_vectors_source');
  ensureIndex('memory_vectors', 'category', 'idx_memory_vectors_category');
  ensureIndex('memory_vectors', 'created_at', 'idx_memory_vectors_created');
  ensureIndex('activity_events', 'created_at', 'idx_gc_activity_created');
  ensureIndex('agent_executions', 'created_at', 'idx_gc_executions_created');
}

export function initDb(): void {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.mkdirSync(LOG_DIR, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec('BEGIN IMMEDIATE');
    db.exec(SCHEMA.activity_events);
    db.exec(SCHEMA.agent_executions);
    db.exec(SCHEMA.memory_vectors);
    db.exec('COMMIT');
    ensureActivityColumns();
    ensureExecutionColumns();
    ensureMemoryVectorColumns();
    ensureMemoryVectorIndexes();

    console.log(`  [db] activity recording: ${DB_PATH}`);
    console.log(`  [db] log dir: ${LOG_DIR}`);
  } catch (err) {
    console.warn('[db] init failed — recording disabled:', err instanceof Error ? err.message : err);
    db = null;
  }
}

export function getDb(): Database.Database | null {
  return db;
}

export function vectorStorageAvailable(): boolean {
  return db !== null;
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
