import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { proveD1SnapshotRestore } from '../release-tools/predeploy-backup-refresh/d1-restore-proof.mjs';
import { exportD1SystemState } from '../src/backup/system-backup-runtime.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

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
});

test('predeploy proof reports the failing stage and SQLite result code without names, SQL or values', async () => {
  const diagnosticOf = async snapshot => {
    let caught;
    await assert.rejects(proveD1SnapshotRestore(snapshot), error => { caught = error; return true; });
    assert.equal(caught.code, 'BACKUP_SQLITE_RESTORE_FAILED');
    assert.equal(caught.message, 'BACKUP_SQLITE_RESTORE_FAILED');
    assert.doesNotMatch(JSON.stringify(caught), /private-|SELECT|CREATE|INSERT|extra_data|constraint failed:/);
    assert.ok(caught.diagnostic.table_count >= 1);
    assert.ok(caught.diagnostic.table_row_count >= 1);
    return caught.diagnostic;
  };
  const duplicate = await snapshotFixture();
  const extra = table(duplicate, 'extra_data');
  extra.rows.push({ ...extra.rows[0] });
  extra.rowCount += 1;
  assert.deepEqual(await diagnosticOf(duplicate), {
    stage: 'insert',
    table_index: duplicate.tables.indexOf(extra),
    table_count: duplicate.tables.length,
    table_row_count: 2,
    row_index: 1,
    error_code: 'ERR_SQLITE_ERROR',
    sqlite_errcode: 1555, // SQLITE_CONSTRAINT_PRIMARYKEY
    sqlite_errstr: 'constraint failed',
  });
  const invalid = await snapshotFixture();
  const broken = table(invalid, 'extra_data');
  broken.schema = 'CREATE TABLE extra_data(id INTEGER PRIMARY KEY, value private-type(';
  assert.deepEqual(await diagnosticOf(invalid), {
    stage: 'schema',
    table_index: invalid.tables.indexOf(broken),
    table_count: invalid.tables.length,
    table_row_count: 1,
    row_index: null,
    error_code: 'ERR_SQLITE_ERROR',
    sqlite_errcode: 1, // SQLITE_ERROR
    sqlite_errstr: 'SQL logic error',
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
