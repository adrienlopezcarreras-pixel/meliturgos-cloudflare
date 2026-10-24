import { DatabaseSync } from 'node:sqlite';
// Real SQL, disposable in-memory database. Never opens project D1 files.
export function sqliteD1({ maintenanceFence = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  if (maintenanceFence) sqlite.exec('CREATE TABLE dev_bridge_state (bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)');
  const db = {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async run() { const result = sqlite.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        async first(column) { const row = sqlite.prepare(sql).get(...params) || null; return column ? row?.[column] : row; }
      };
    },
    async batch(statements) { const results=[]; for(const statement of statements) results.push(await statement.run()); return results; },
    close() { sqlite.close(); }
  };
  return db;
}
