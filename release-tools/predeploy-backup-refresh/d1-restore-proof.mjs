import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { comparePatrimonyExports } from '../../src/backup/restore-service.js';
import { stableStringify } from '../../src/resilience/recovery-bundle.js';
import { exportD1 } from './d1-export.mjs';

const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const digest = value => createHash('sha256').update(value).digest('hex');

function exportDigest(value) {
  const tables = value.tables.map(table => ({
    name: table.name,
    schema: table.schema,
    rows: table.rows.map(row => digest(stableStringify(row))).sort(),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return digest(stableStringify(tables));
}

function binding(value) {
  if (value === null || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)
      && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
  // D1 serializes BLOBs as byte arrays. Never coerce unsupported values.
  if (Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return new Uint8Array(value);
  }
  fail('BACKUP_SQLITE_VALUE_UNSUPPORTED');
}

function exportRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key, value instanceof Uint8Array ? Array.from(value) : value,
  ]));
}

/** Restore only the captured logical snapshot in disposable SQLite, never production. */
export async function proveD1SnapshotRestore(database) {
  const initial = comparePatrimonyExports(database, database);
  if (initial.ok !== true) fail('BACKUP_SQLITE_PATRIMONY_INVALID');
  // This connection cannot access D1; schema is prepared as one CREATE TABLE
  // statement, so a second statement can never attach/read/write another file.
  const sqlite = new DatabaseSync(':memory:', { allowExtension: false });
  let stage = 'begin';
  let tableHash = null;
  try {
    sqlite.exec('PRAGMA foreign_keys=OFF; BEGIN');
    for (const table of database.tables) {
      stage = 'create_table';
      tableHash = digest(String(table.name));
      if (!/^\s*CREATE\s+TABLE\b/i.test(table.schema || '')
          || !table.name || String(table.name).startsWith('sqlite_') || String(table.name).startsWith('_cf_')) {
        fail('BACKUP_SQLITE_SCHEMA_UNSUPPORTED');
      }
      sqlite.prepare(table.schema).run();
    }
    for (const table of database.tables) {
      stage = 'insert_rows';
      tableHash = digest(String(table.name));
      const info = sqlite.prepare(`PRAGMA table_xinfo(${quote(table.name)})`).all();
      if (!info.length) fail('BACKUP_SQLITE_TABLE_MISSING');
      const writable = info.filter(column => column.hidden === 0).map(column => column.name);
      const columns = info.map(column => column.name);
      const statement = sqlite.prepare(`INSERT INTO ${quote(table.name)} (${writable.map(quote).join(',')}) VALUES (${writable.map(() => '?').join(',')})`);
      for (const row of table.rows) {
        if (!row || Object.keys(row).length !== columns.length
            || columns.some(column => !Object.hasOwn(row, column))) fail('BACKUP_SQLITE_ROW_COLUMNS_MISMATCH');
        statement.run(...writable.map(column => binding(row[column])));
      }
    }
    stage = 'commit';
    tableHash = null;
    sqlite.exec('COMMIT; PRAGMA foreign_keys=ON');
    stage = 'foreign_key_check';
    if (sqlite.prepare('PRAGMA foreign_key_check').all().length) fail('BACKUP_SQLITE_FOREIGN_KEY_MISMATCH');
    stage = 'integrity_check';
    const integrity = sqlite.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') fail('BACKUP_SQLITE_INTEGRITY_FAILED');

    // Reuse the exact bounded exporter used for the production snapshot.
    stage = 'reexport';
    const restored = await exportD1(null, async (_sidecar, path) => {
      if (path === '/d1/tables') return {
        status: 'D1_TABLES',
        tables: sqlite.prepare("SELECT name, sql AS schema FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all(),
      };
      const url = new URL(path, 'https://isolated.invalid');
      const table = url.searchParams.get('table');
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      const rows = sqlite.prepare(`SELECT * FROM ${quote(table)} LIMIT ? OFFSET ?`).all(limit, offset).map(exportRow);
      return { status: 'D1_ROWS_PAGE', table, offset, limit, rows, has_more: rows.length === limit };
    });
    stage = 'compare';
    const patrimony = comparePatrimonyExports(database, restored);
    const sourceHash = exportDigest(database);
    const restoredHash = exportDigest(restored);
    if (patrimony.ok !== true || patrimony.identical !== true || sourceHash !== restoredHash) {
      fail('BACKUP_SQLITE_RESTORE_MISMATCH');
    }
    return {
      ok: true,
      code: 'BACKUP_SQLITE_RESTORE_VERIFIED',
      engine: 'sqlite',
      table_count: restored.tableCount,
      row_count: restored.tables.reduce((sum, table) => sum + table.rowCount, 0),
      source_export_sha256: sourceHash,
      restored_export_sha256: restoredHash,
      patrimony_identical: true,
      production_written: false,
    };
  } catch (error) {
    // SQLite errors can include schema identifiers or private row contents.
    const code = /^BACKUP_SQLITE_[A-Z_]+$/.test(error?.code || '') ? error.code : 'BACKUP_SQLITE_RESTORE_FAILED';
    const reasons = [
      [/no such column/i, 'UNKNOWN_COLUMN'],
      [/no such function/i, 'UNKNOWN_FUNCTION'],
      [/no such collation/i, 'UNKNOWN_COLLATION'],
      [/syntax error/i, 'SQL_SYNTAX'],
      [/UNIQUE constraint failed/i, 'UNIQUE_CONSTRAINT'],
      [/CHECK constraint failed/i, 'CHECK_CONSTRAINT'],
      [/NOT NULL constraint failed/i, 'NOT_NULL_CONSTRAINT'],
      [/FOREIGN KEY constraint failed|foreign key mismatch/i, 'FOREIGN_KEY_CONSTRAINT'],
      [/already exists/i, 'SCHEMA_COLLISION'],
    ];
    const reason = reasons.find(([pattern]) => pattern.test(String(error?.message || '')))?.[1] || 'UNCLASSIFIED';
    const diagnostic = {
      stage, reason, table_sha256: tableHash,
      sqlite_errcode: Number.isSafeInteger(error?.errcode) ? error.errcode : null,
    };
    throw Object.assign(new Error(code), { code, diagnostic });
  } finally {
    sqlite.close();
  }
}
