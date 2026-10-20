import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { proveD1SnapshotRestore } from '../release-tools/predeploy-backup-refresh/d1-restore-proof.mjs';
import { exportD1SystemState } from '../src/backup/system-backup-runtime.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { probeD1Restore } from '../release-tools/predeploy-backup-refresh/probe-d1-restore.mjs';
import restorePreview from '../release-tools/predeploy-backup-refresh/restore-preview-entry.mjs';

async function snapshotFixture() {
  const source = sqliteD1();
  try {
    await source.prepare('CREATE TABLE evolution_ledger(event_id TEXT PRIMARY KEY, evidence_json TEXT NOT NULL)').run();
    await source.prepare('CREATE TABLE conversations(id TEXT PRIMARY KEY, title TEXT)').run();
    await source.prepare('CREATE TABLE dev_jobs(id TEXT PRIMARY KEY, result_json TEXT)').run();
    await source.prepare('CREATE TABLE extra_data(id INTEGER PRIMARY KEY, value INTEGER NOT NULL, doubled INTEGER GENERATED ALWAYS AS (value * 2) STORED)').run();
    await source.prepare('INSERT INTO evolution_ledger VALUES (?, ?)').bind('event-1', 'private-ledger-evidence').run();
    await source.prepare('INSERT INTO conversations VALUES (?, ?)').bind('conversation-1', 'private-conversation-title').run();
    await source.prepare('INSERT INTO dev_jobs VALUES (?, ?)').bind('job-1', 'private-job-result').run();
    await source.prepare('INSERT INTO extra_data(id, value) VALUES (?, ?)').bind(1, 21).run();
    return await exportD1SystemState(source);
  } finally {
    source.close();
  }
}

function table(snapshot, name) {
  return snapshot.tables.find(entry => entry.name === name);
}

async function rejectsSafely(snapshot, code) {
  await assert.rejects(proveD1SnapshotRestore(snapshot), error => {
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.doesNotMatch(JSON.stringify(error), /private-|SELECT|CREATE TABLE/);
    return true;
  });
}

test('predeploy restores a real SQLite export, executes generated columns, and returns only hashes and counts', async () => {
  const snapshot = await snapshotFixture();
  const before = JSON.stringify(snapshot);
  const proof = await proveD1SnapshotRestore(snapshot);
  assert.equal(JSON.stringify(snapshot), before, 'the captured production export is not mutated');
  assert.equal(proof.ok, true);
  assert.equal(proof.engine, 'sqlite');
  assert.equal(proof.table_count, 4);
  assert.equal(proof.row_count, 4);
  assert.equal(proof.patrimony_identical, true);
  assert.equal(proof.production_written, false);
  assert.match(proof.source_export_sha256, /^[a-f0-9]{64}$/);
  assert.equal(proof.source_export_sha256, proof.restored_export_sha256);
  assert.doesNotMatch(JSON.stringify(proof), /private-|event-1|conversation-1|job-1|CREATE TABLE|extra_data/);
});

test('predeploy proof rejects a corrupt generated value despite unchanged counts and row identity', async () => {
  const snapshot = await snapshotFixture();
  table(snapshot, 'extra_data').rows[0].doubled = 999;
  await rejectsSafely(snapshot, 'BACKUP_SQLITE_RESTORE_MISMATCH');
});

test('predeploy proof compares complete non-patrimony rows and rejects lossy SQLite affinity', async () => {
  const snapshot = await snapshotFixture();
  table(snapshot, 'extra_data').rows[0].value = '021';
  await rejectsSafely(snapshot, 'BACKUP_SQLITE_RESTORE_MISMATCH');
});

test('predeploy proof cannot certify an absent mandatory patrimony table', async () => {
  const snapshot = await snapshotFixture();
  snapshot.tables = snapshot.tables.filter(entry => entry.name !== 'dev_jobs');
  snapshot.tableCount = snapshot.tables.length;
  await rejectsSafely(snapshot, 'BACKUP_SQLITE_PATRIMONY_INVALID');
});

test('predeploy proof cannot certify duplicate tables or duplicate patrimony identities', async () => {
  const snapshot = await snapshotFixture();
  snapshot.tables.push(structuredClone(snapshot.tables[0]));
  snapshot.tableCount += 1;
  await rejectsSafely(snapshot, 'BACKUP_SQLITE_PATRIMONY_INVALID');
  const duplicate = await snapshotFixture();
  const jobs = table(duplicate, 'dev_jobs');
  jobs.rows.push({ ...jobs.rows[0], result_json: 'different-private-result' });
  jobs.rowCount += 1;
  await rejectsSafely(duplicate, 'BACKUP_SQLITE_PATRIMONY_INVALID');
});

test('predeploy proof executes real CHECK constraints and sanitizes SQL error messages', async () => {
  const snapshot = await snapshotFixture();
  const extra = table(snapshot, 'extra_data');
  extra.schema = extra.schema.replace('value INTEGER NOT NULL', 'value INTEGER NOT NULL CHECK(value > 0)');
  extra.rows[0].value = -1;
  await rejectsSafely(snapshot, 'BACKUP_SQLITE_RESTORE_FAILED');
  await assert.rejects(proveD1SnapshotRestore(snapshot), error => {
    assert.equal(error.diagnostic.stage, 'insert_rows');
    assert.equal(error.diagnostic.reason, 'CHECK_CONSTRAINT');
    assert.match(error.diagnostic.table_sha256, /^[a-f0-9]{64}$/);
    assert.equal(error.diagnostic.sqlite_errcode, 275);
    assert.doesNotMatch(JSON.stringify(error), /extra_data|private-|value|CREATE TABLE/);
    return true;
  });
});

test('predeploy restores foreign keys without relying on table order and rejects broken references', async () => {
  const snapshot = await snapshotFixture();
  const jobs = table(snapshot, 'dev_jobs');
  jobs.schema = 'CREATE TABLE dev_jobs(id TEXT PRIMARY KEY, result_json TEXT REFERENCES conversations(id))';
  jobs.rows[0].result_json = 'conversation-1';
  snapshot.tables.reverse();
  assert.equal((await proveD1SnapshotRestore(snapshot)).ok, true);
  jobs.rows[0].result_json = 'missing-private-reference';
  await rejectsSafely(snapshot, 'BACKUP_SQLITE_FOREIGN_KEY_MISMATCH');
});

test('predeploy restores D1 byte-array BLOBs without coercing unsupported values', async () => {
  const snapshot = await snapshotFixture();
  const extra = table(snapshot, 'extra_data');
  extra.schema = 'CREATE TABLE extra_data(id INTEGER PRIMARY KEY, value BLOB)';
  extra.rows = [{ id: 1, value: [0, 9, 255] }];
  assert.equal((await proveD1SnapshotRestore(snapshot)).ok, true);
  extra.rows[0].value = { unknown: 'private-value' };
  await rejectsSafely(snapshot, 'BACKUP_SQLITE_VALUE_UNSUPPORTED');
});

test('predeploy refuses unsupported virtual schemas and partial rows instead of inventing compatibility', async () => {
  const snapshot = await snapshotFixture();
  const extra = table(snapshot, 'extra_data');
  extra.schema = 'CREATE VIRTUAL TABLE extra_data USING fts5(value)';
  await rejectsSafely(snapshot, 'BACKUP_SQLITE_SCHEMA_UNSUPPORTED');
  const incomplete = await snapshotFixture();
  delete table(incomplete, 'dev_jobs').rows[0].result_json;
  await rejectsSafely(incomplete, 'BACKUP_SQLITE_ROW_COLUMNS_MISMATCH');
});

test('predeploy runner requires the real restore before registering restoreVerified metadata', async () => {
  const runner = await readFile(new URL('../release-tools/predeploy-backup-refresh/runner.mjs', import.meta.url), 'utf8');
  const proof = runner.indexOf('await proveD1SnapshotRestore(snapshot.exports.database)');
  const registration = runner.indexOf('restoreVerified: true');
  assert.ok(proof > 0 && proof < registration);
  assert.match(runner, /sqliteRestoreProof,/);
  assert.match(runner, /isolated_restore: persisted\.sqliteRestoreProof/);
});

test('production restore probe uses only bounded SELECT queries and never exports private values', async () => {
  const snapshot = await snapshotFixture();
  const calls = [];
  const proof = await probeD1Restore({
    accountId: 'a'.repeat(32), apiToken: 'private-token', databaseId: 'b'.repeat(36),
    fetchImpl: async (url, options) => {
      const { sql, params } = JSON.parse(options.body);
      assert.match(sql, /^SELECT\s/);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer private-token');
      assert.equal(new URL(url).hostname, 'api.cloudflare.com');
      assert.equal(options.signal.aborted, false);
      calls.push(sql);
      let results;
      if (sql.includes('sqlite_master')) {
        results = snapshot.tables.map(({ name, schema }) => ({ name, schema }));
      } else {
        const name = sql.match(/FROM "([^"]+)"/)[1];
        const [limit, offset] = params;
        assert.equal(limit, 500);
        assert.equal(offset, 0);
        results = table(snapshot, name).rows.slice(offset, offset + limit);
      }
      return Response.json({ success: true, result: [{ success: true, results }] });
    },
  });
  assert.equal(proof.ok, true);
  assert.equal(proof.production_written, false);
  assert.equal(calls.length, 5);
  assert.doesNotMatch(JSON.stringify(proof), /private-|CREATE|extra_data|conversations/);
});

test('production restore probe redacts Cloudflare errors and refuses redirects or malformed results', async () => {
  for (const payload of [
    { success: false, errors: [{ message: 'private-row-or-schema' }] },
    { success: true, result: [{ success: true, results: null }] },
  ]) {
    await assert.rejects(probeD1Restore({
      accountId: 'a'.repeat(32), apiToken: 'private-token', databaseId: 'b'.repeat(36),
      fetchImpl: async () => Response.json(payload),
    }), error => error.code === 'RESTORE_PROBE_QUERY_FAILED' && !JSON.stringify(error).includes('private-'));
  }
});

test('isolated binding preview requires its ephemeral token and exposes no sidecar write routes', async () => {
  let calls = 0;
  const env = { MEL_RESTORE_PREVIEW_TOKEN: 'p'.repeat(40), DB: { prepare(sql) {
    assert.match(sql, /^SELECT\s/);
    calls += 1;
    return { async all() { return { results: [] }; } };
  } } };
  const invoke = (path, method = 'GET', authorized = true) => restorePreview.fetch(new Request('https://preview.test' + path, {
    method, headers: authorized ? { authorization: 'Bearer ' + env.MEL_RESTORE_PREVIEW_TOKEN } : {},
  }), env);
  assert.equal((await invoke('/d1/tables', 'GET', false)).status, 401);
  assert.equal((await invoke('/register', 'POST')).status, 405);
  assert.equal((await invoke('/upload/create', 'GET')).status, 404);
  assert.equal(calls, 0);
  const response = await invoke('/d1/tables');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'D1_TABLES');
  assert.equal(calls, 1);
});
