import { getDb, vectorStorageAvailable } from '../db.js';

type MemoryToolName =
  | 'memory_add_episodic'
  | 'memory_add_semantic'
  | 'memory_get_context'
  | 'memory_get_recent'
  | 'memory_set_context'
  | 'memory_search_unified';

type MemoryToolArgs = Record<string, unknown>;

const VECTOR_DIMENSIONS = 64;
const MAX_TEXT_CHARS = 3000;

type MemoryVectorRow = {
  id: number;
  source_id: string;
  category: string;
  text: string;
  metadata: string | null;
  embedding: string | null;
  created_at: number;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) ? value : fallback;
}

function parseMetadata(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toText(value: unknown): string {
  return asString(value).trim();
}

function normalizeText(value: unknown): string {
  return toText(value).slice(0, MAX_TEXT_CHARS).replace(/\s+/g, ' ').trim();
}

function toSourceId(args: MemoryToolArgs): string {
  const fromSource = toText((args as { sourceId?: unknown }).sourceId);
  if (fromSource) return fromSource;
  const fromProject = toText((args as { project?: unknown }).project);
  return fromProject || 'gravity-claw';
}

function sanitizeLimit(value: unknown, fallback: number, max: number): number {
  const parsed = asInt(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function hashToken(token: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x5bd1e995);
    hash ^= hash >>> 15;
  }
  return hash >>> 0;
}

function embedText(text: string): number[] {
  const vector = new Array(VECTOR_DIMENSIONS).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').trim();
  const tokens = normalized ? normalized.split(/\s+/).filter(Boolean) : [];

  if (tokens.length === 0) {
    return vector;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    const seed = hashToken(token, 0x9e3779b9 ^ i);
    const weight = 1 / (1 + i * 0.05);
    for (let b = 0; b < 4; b += 1) {
      vector[(seed + b) % VECTOR_DIMENSIONS] += weight / (b + 1);
    }
  }

  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;

  for (let i = 0; i < vector.length; i += 1) {
    vector[i] /= norm;
  }
  return vector;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < VECTOR_DIMENSIONS && i < b.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function rowToText(row: MemoryVectorRow, textLimit = 240): string {
  const at = new Date(row.created_at).toISOString();
  const snippet = row.text.length > textLimit ? `${row.text.slice(0, textLimit)}…` : row.text;
  const meta = row.metadata ? ` ${row.metadata}` : '';
  return `[${at}] (${row.category}) ${snippet}${meta}`;
}

function listEntries(sourceId: string, args: MemoryToolArgs): MemoryVectorRow[] {
  const db = getDb();
  if (!db) throw new Error('memory DB unavailable');

  const limit = sanitizeLimit(args.limit, 5, 20);
  const category = toText((args as { category?: unknown }).category);
  const query = category
    ? `SELECT id, source_id, category, text, metadata, embedding, created_at FROM memory_vectors WHERE source_id = ? AND category = ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT id, source_id, category, text, metadata, embedding, created_at FROM memory_vectors WHERE source_id = ? ORDER BY created_at DESC LIMIT ?`;

  const rows = category
    ? (db.prepare(query).all(sourceId, category, limit) as MemoryVectorRow[])
    : (db.prepare(query).all(sourceId, limit) as MemoryVectorRow[]);
  return rows;
}

function readRecentText(args: MemoryToolArgs): string | null {
  const sourceId = toSourceId(args);
  const rows = listEntries(sourceId, args);
  if (rows.length === 0) return null;
  return rows.map((row) => rowToText(row)).join('\n');
}

function addTextEntry(args: MemoryToolArgs, categoryDefault: string, useEmbedding: boolean): void {
  const db = getDb();
  if (!db) return;
  const sourceId = toSourceId(args) || 'gravity-claw';
  const category = toText((args as { category?: unknown }).category) || categoryDefault;
  const text = normalizeText((args as { text?: unknown }).text) || normalizeText((args as { query?: unknown }).query) ||
    normalizeText((args as { response?: unknown }).response);
  const metadata = parseMetadata((args as { metadata?: unknown }).metadata);
  const createdAt = Date.now();
  const embedding = useEmbedding && text ? JSON.stringify(embedText(text)) : null;

  if (!text) throw new Error(`memory text is required for ${category}`);

  db.prepare(
    'INSERT INTO memory_vectors (source_id, category, text, metadata, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(sourceId, category, text, metadata || null, embedding, createdAt);
}

function searchText(query: string, rows: MemoryVectorRow[]): MemoryVectorRow[] {
  const queryVector = embedText(query);
  const ranked = rows
    .map((row) => {
      const rowVector = row.embedding ? JSON.parse(row.embedding) : [];
      const score = cosineSimilarity(queryVector, rowVector);
      return { row, score };
    })
    .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map((entry) => entry.row);
  return ranked;
}

export async function callLocalMemoryTool(name: string, args: MemoryToolArgs): Promise<string | null> {
  if (!vectorStorageAvailable()) {
    return null;
  }

  const toolName = name as MemoryToolName;
  const sourceId = toSourceId(args);

  switch (toolName) {
    case 'memory_add_semantic': {
      const text = normalizeText((args as { text?: unknown }).text);
      if (!text) throw new Error('memory_add_semantic requires text');
      addTextEntry({ ...args, text, category: toText((args as { category?: unknown }).category) || 'semantic' }, 'semantic', true);
      return `Stored semantic memory entry for ${sourceId}`;
    }

    case 'memory_add_episodic': {
      const query = normalizeText((args as { query?: unknown }).query);
      const response = normalizeText((args as { response?: unknown }).response);
      const combined = `${query}${query && response ? '\n' : ''}${response}`.trim();
      addTextEntry(
        { ...args, text: combined, category: 'episodic', metadata: parseMetadata((args as { metadata?: unknown }).metadata) },
        'episodic',
        false,
      );
      return `Stored episodic memory entry for ${sourceId}`;
    }

    case 'memory_set_context': {
      const status = normalizeText((args as { status?: unknown }).status) || 'set';
      addTextEntry(
        {
          ...args,
          text: `context:${status}`,
          category: 'context-state',
          metadata: parseMetadata((args as { project?: unknown }).project || sourceId),
        },
        'context-state',
        false,
      );
      return `Memory context updated for ${sourceId}`;
    }

    case 'memory_get_recent': {
      const text = readRecentText(args);
      if (!text) return null;
      return text;
    }

    case 'memory_get_context': {
      const recent = readRecentText({ ...args, limit: 8 });
      const contextRows = listEntries(sourceId, { ...args, category: 'context-state', limit: 4 });
      const parts: string[] = [];
      if (recent) parts.push(recent);
      if (contextRows.length > 0) {
        parts.push(contextRows.map((row) => rowToText(row, 300)).join('\n'));
      }
      return parts.length > 0 ? parts.join('\n\n') : null;
    }

    case 'memory_search_unified': {
      const query = normalizeText((args as { query?: unknown }).query);
      if (!query) throw new Error('memory_search_unified requires query');
      const sourceRows = listEntries(sourceId, { limit: 200, category: toText((args as { category?: unknown }).category) || '' });
      const rows = searchText(query, sourceRows);
      const limit = sanitizeLimit((args as { limit?: unknown }).limit, 5, 12);
      if (rows.length === 0) return null;
      return rows.slice(0, limit).map((row) => rowToText(row)).join('\n');
    }

    default:
      return null;
  }
}
