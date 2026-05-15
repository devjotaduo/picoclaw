// Node-only DB layer for the picoclaw-saas-vendored fork of open-crm.
// Keeps the same exported API (`initDB`, `query`, `get`, `run`) the upstream
// `index.ts` calls, but routes through `better-sqlite3` instead of D1.
//
// `initDB(path)` is called once at process boot from `server.ts`. The
// per-request middleware in index.ts then re-calls `initDB(c.env.DB)` with an
// undefined value (since we have no Workers env bindings); we make that path
// a safe no-op.

import Database from "better-sqlite3";

type StatementResult = {
  changes: number;
  lastInsertRowid: number;
};

let _db: Database.Database | null = null;

export function initDB(arg: unknown): void {
  if (_db) return; // idempotent — middleware retries on every request
  if (typeof arg !== "string" || !arg) {
    // Called from the upstream middleware with `c.env.DB`, which is undefined
    // in Node. We rely on the bootstrap call from server.ts to have already
    // opened the DB.
    return;
  }
  _db = new Database(arg);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
}

function db(): Database.Database {
  if (!_db) throw new Error("db not initialized");
  return _db;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db().prepare(sql).all(...(params as unknown[])) as T[];
}

export async function get<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const row = db().prepare(sql).get(...(params as unknown[]));
  return (row ?? undefined) as T | undefined;
}

export async function run(
  sql: string,
  params: unknown[] = [],
): Promise<StatementResult> {
  const info = db().prepare(sql).run(...(params as unknown[]));
  return {
    changes: info.changes,
    lastInsertRowid: Number(info.lastInsertRowid),
  };
}

export function execSchema(sql: string): void {
  db().exec(sql);
}
