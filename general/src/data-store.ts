import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DB_PATH = resolve(PROJECT_ROOT, 'data', 'store.db');

function getDb(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/** Save a JSON-serializable value to the key-value store. */
export function saveToStore(key: string, value: unknown): void {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, JSON.stringify(value));
  } finally {
    db.close();
  }
}

/** Read and JSON-parse a value from the store. Returns undefined if key is missing. */
export function getFromStore<T>(key: string): T | undefined {
  const db = getDb();
  try {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (!row) return undefined;
    return JSON.parse(row.value) as T;
  } finally {
    db.close();
  }
}

/** Delete a key from the store. */
export function deleteFromStore(key: string): void {
  const db = getDb();
  try {
    db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  } finally {
    db.close();
  }
}
