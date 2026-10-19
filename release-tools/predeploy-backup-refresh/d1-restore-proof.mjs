import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { comparePatrimonyExports } from '../../src/backup/restore-service.js';
import { stableStringify } from '../../src/resilience/recovery-bundle.js';
import { exportD1 } from './d1-export.mjs';

const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
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

// Only fixed vocabularies leave this module: never SQLite messages, SQL, names or values.
function safeDiagnostic(error, stage, tableIndex, tableCount, tableRowCount, rowIndex) {
  const prefix = /^([A-Z][A-Z0-9_]{1,63})(?::|$)/.exec(String(error?.message || ''))?.[1] || null;
  return {
    stage,
    table_index: Number.isInteger(tableIndex) ? tableIndex : null,
    table_count: Number.isSafeInteger(tableCount) && tableCount >= 0 ? tableCount : null,
    table_row_count: Number.isSafeInteger(tableRowCount) && tableRowCount >= 0 ? tableRowCount : null,
    row_index: Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : null,
    error_code: SAFE_CODE.test(error?.code || '') ? error.code : prefix,
    sqlite_errcode: Number.isInteger(error?.errcode) ? error.errcode : null,
    // sqlite3_errstr() is the generic text for the result code, e.g. "constraint failed".
    sqlite_errstr: /^[a-z ]{1,80}$/i.test(error?.errstr || '') ? error.errstr : null,
  };
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
  let tableIndex = null;
  let tableRowCount = null;
  let rowIndex = null;
  try {
    sqlite.exec('PRAGMA foreign_keys=OFF; BEGIN');
    stage = 'schema';
    for (const [index, table] of database.tables.entries()) {
      tableIndex = index;
      tableRowCount = Array.isArray(table.rows) ? table.rows.length : null;
      rowIndex = null;
      if (!/^\s*CREATE\s+TABLE\b/i.test(table.schema || '')
          || !table.name || String(table.name).startsWith('sqlite_') || String(table.name).startsWith('_cf_')) {
        fail('BACKUP_SQLITE_SCHEMA_UNSUPPORTED');
      }
      sqlite.prepare(table.schema).run();
    }
    stage = 'insert';
    for (const [index, table] of database.tables.entries()) {
      tableIndex = index;
      tableRowCount = Array.isArray(table.rows) ? table.rows.length : null;
      rowIndex = null;
      const info = sqlite.prepare(`PRAGMA table_xinfo(${quote(table.name)})`).all();
      if (!info.length) fail('BACKUP_SQLITE_TABLE_MISSING');
      const writable = info.filter(column => column.hidden === 0).map(column => column.name);
      const columns = info.map(column => column.name);
      const statement = sqlite.prepare(`INSERT INTO ${quote(table.name)} (${writable.map(quote).join(',')}) VALUES (${writable.map(() => '?').join(',')})`);
      for (const [index, row] of table.rows.entries()) {
        rowIndex = index;
        if (!row || Object.keys(row).length !== columns.length
            || columns.some(column => !Object.hasOwn(row, column))) fail('BACKUP_SQLITE_ROW_COLUMNS_MISMATCH');
        statement.run(...writable.map(column => binding(row[column])));
      }
    }
    tableIndex = null;
    tableRowCount = null;
    rowIndex = null;
    stage = 'commit';
    sqlite.exec('COMMIT; PRAGMA foreign_keys=ON');
    stage = 'foreign_key_check';
    if (sqlite.prepare('PRAGMA foreign_key_check').all().length) fail('BACKUP_SQLITE_FOREIGN_KEY_MISMATCH');
    stage = 'integrity_check';
    const integrity = sqlite.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') fail('BACKUP_SQLITE_INTEGRITY_FAILED');

    stage = 'export';
    // Reuse the exact bounded exporter used for the production snapshot.
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
    throw Object.assign(new Error(code), { code, diagnostic: safeDiagnostic(error, stage, tableIndex, database.tables.length, tableRowCount, rowIndex) });
  } finally {
    sqlite.close();
  }
}
