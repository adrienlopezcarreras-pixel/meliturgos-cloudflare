import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerifiedBackupService } from '../src/backup/backup-service.js';
import { createRestoreService, verifyRestoreCandidate, comparePatrimonyExports } from '../src/backup/restore-service.js';

function memoryStorage() {
  const rows = new Map();
  return {
    rows,
    async put(snapshot) { rows.set(snapshot.id, structuredClone(snapshot)); },
    async get(id) { return rows.has(id) ? structuredClone(rows.get(id)) : null; },
    async list() { return [...rows.values()]; },
  };
}

async function verifiedFixture() {
  const storage = memoryStorage();
  const backups = createVerifiedBackupService({
    storage,
    now: () => '2026-09-20T04:00:00.000Z',
    sources: {
      database: async () => ({
        type: 'MEL_D1_LOGICAL_EXPORT_V1',
        tableCount: 1,
        tables: [{ name: 'memories', schema: 'CREATE TABLE memories(id TEXT)', rowCount: 1, rows: [{ id: 'm1' }] }],
      }),
      r2_inventory: async () => ({
        type: 'MEL_R2_INVENTORY_V1',
        objectCount: 1,
        objects: [{ key: 'media/a', size: 12, etag: 'etag-a', uploaded: null }],
      }),
      runtime: async () => ({
        type: 'MEL_RUNTIME_DESCRIPTOR_V1',
        appVersion: '0.2.5',
        dbSchemaVersion: 7,
        worker: 'meliturgos',
        candidateBranch: 'candidate/mel-clean-autonomy',
        runtimeEnvironment: 'production',
      }),
    },
  });
  const created = await backups.create({ id: 'restore-proof' });
  return { storage, snapshot: storage.rows.get(created.id) };
}

test('restore candidate verifies complete D1, R2 inventory and runtime descriptor', async () => {
  const { snapshot } = await verifiedFixture();
  const result = await verifyRestoreCandidate(snapshot);
  assert.equal(result.ok, true);
  assert.equal(result.database.tableCount, 1);
  assert.equal(result.database.rowCount, 1);
  assert.equal(result.r2.objectCount, 1);
  assert.equal(result.critical_recovery_scope.production_activation_automatic, false);
  assert.equal(result.critical_recovery_scope.r2_object_bytes_embedded, false);
});

test('restore service produces a non-activating plan and fails closed without exact approval', async () => {
  const { storage, snapshot } = await verifiedFixture();
  const service = createRestoreService({ storage });
  const planned = await service.plan({ id: snapshot.id });
  assert.equal(planned.ok, true);
  assert.equal(planned.plan.automatic_activation, false);
  assert.equal(planned.plan.requires_owner_approval, true);
  await assert.rejects(
    () => service.restore({ id: snapshot.id }),
    (error) => error?.message === 'RESTORE_OWNER_REQUIRED',
  );
});

test('restore execution requires owner permission, exact snapshot approval and critical-code proof', async () => {
  const { storage, snapshot } = await verifiedFixture();
  const calls = [];
  const service = createRestoreService({
    storage,
    target: {
      async verifyCriticalCode() { calls.push('code'); return { ok: true, source: 'shardvault-7x' }; },
      async restoreDatabase(database) { calls.push(['db', database.tableCount]); },
      async activate() { calls.push('activate'); return { ok: true }; },
    },
  });
  const result = await service.restore({
    id: snapshot.id,
    approval: { approved: true, action: 'RESTORE_SYSTEM', snapshot_id: snapshot.id },
  }, {
    owner: true,
    permissions: ['backup:restore'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.production_activation_automatic, false);
  assert.deepEqual(calls, ['code', ['db', 1], 'activate']);
});

test('tampered verified snapshot is rejected before restore planning', async () => {
  const { storage, snapshot } = await verifiedFixture();
  const tampered = structuredClone(snapshot);
  tampered.exports.database.tables[0].rows.push({ id: 'evil' });
  storage.rows.set(snapshot.id, tampered);
  const service = createRestoreService({ storage });
  await assert.rejects(
    () => service.plan({ id: snapshot.id }),
    /SNAPSHOT_ENTRY_INTEGRITY_MISMATCH|SNAPSHOT_INTEGRITY_MISMATCH/,
  );
});

test('patrimony comparison reads two exports and writes nothing', () => {
  const table = (name, ids) => ({
    name,
    schema: 'CREATE TABLE ' + name + '(' + (name === 'evolution_ledger' ? 'event_id' : 'id') + ' TEXT)',
    rowCount: ids.length,
    rows: ids.map(id => ({ [name === 'evolution_ledger' ? 'event_id' : 'id']: id })),
  });
  const pack = (ledger, conversations, jobs) => ({
    type: 'MEL_D1_LOGICAL_EXPORT_V1',
    tableCount: 3,
    tables: [table('evolution_ledger', ledger), table('conversations', conversations), table('dev_jobs', jobs)],
  });
  const before = pack(['e1'], ['c1'], ['j1']);
  const same = comparePatrimonyExports(before, pack(['e1'], ['c1'], ['j1']));
  assert.equal(same.ok, true);
  assert.equal(same.identical, true);
  assert.equal(same.production_written, false);
  const changed = comparePatrimonyExports(before, pack(['e1', 'e2'], ['c1'], ['j1']));
  assert.equal(changed.identical, false);
  assert.equal(changed.tables.evolution_ledger.same, false);
  assert.equal(changed.tables.conversations.same, true);
  assert.equal(changed.production_written, false);
});

test('the patrimony comparison is a real capability and writes nothing', async () => {
  const { createGen2Runtime } = await import('../src/core/orchestrator/gen2-runtime.js');
  const runtime = createGen2Runtime({ env: {} });
  const pack = (ids) => ({
    type: 'MEL_D1_LOGICAL_EXPORT_V1',
    tableCount: 3,
    tables: ['evolution_ledger', 'conversations', 'dev_jobs'].map(name => ({
      name,
      schema: 'CREATE TABLE ' + name + '(' + (name === 'evolution_ledger' ? 'event_id' : 'id') + ' TEXT)',
      rowCount: ids.length,
      rows: ids.map(id => ({ [name === 'evolution_ledger' ? 'event_id' : 'id']: id })),
    })),
  });
  const result = await runtime.bus.execute('backup.patrimony.compare', {
    before: pack(['a']),
    after: pack(['a', 'b']),
  }, { owner: 'owner', permissions: [] });
  assert.equal(result.ok, true);
  assert.equal(result.identical, false);
  assert.equal(result.production_written, false);
  assert.equal(result.tables.evolution_ledger.after, 2);
});

function patrimonyFixture() {
  return {
    type: 'MEL_D1_LOGICAL_EXPORT_V1',
    tableCount: 3,
    tables: [
      { name: 'evolution_ledger', schema: 'CREATE TABLE evolution_ledger(event_id TEXT UNIQUE, evidence_json TEXT)', rows: [
        { event_id: 'e1', evidence_json: '{"verified":true}' },
        { event_id: 'e2', evidence_json: '{"verified":false}' },
      ] },
      { name: 'conversations', schema: 'CREATE TABLE conversations(id TEXT PRIMARY KEY, title TEXT)', rows: [
        { id: 'c1', title: 'Conversation originale' },
      ] },
      { name: 'dev_jobs', schema: 'CREATE TABLE dev_jobs(id TEXT PRIMARY KEY, result_json TEXT)', rows: [
        { id: 'j1', result_json: '{"status":"WAITING_TEACHER"}' },
      ] },
    ].map(table => ({ ...table, rowCount: table.rows.length })),
  };
}

test('patrimony comparison rejects changed content even when every identity and row count is preserved', () => {
  const before = patrimonyFixture();
  for (const [name, field] of [['evolution_ledger', 'evidence_json'], ['conversations', 'title'], ['dev_jobs', 'result_json']]) {
    const after = structuredClone(before);
    after.tables.find(table => table.name === name).rows[0][field] = 'corrupted';
    const result = comparePatrimonyExports(before, after);
    assert.equal(result.ok, true);
    assert.equal(result.identical, false, name + ' content must be compared');
    assert.equal(result.tables[name].same, false);
    assert.equal(result.production_written, false);
  }
  assert.deepEqual(before, patrimonyFixture(), 'comparison must not mutate the source export');
});

test('patrimony comparison accepts the same complete data in a different table, row and property order', () => {
  const before = patrimonyFixture();
  const after = structuredClone(before);
  after.tables.reverse();
  for (const table of after.tables) {
    table.rows.reverse();
    table.rows = table.rows.map(row => Object.fromEntries(Object.entries(row).reverse()));
  }
  const result = comparePatrimonyExports(before, after);
  assert.equal(result.ok, true);
  assert.equal(result.identical, true);
  assert.equal(result.production_written, false);
});

test('patrimony comparison fails closed when a required table is absent, even from both exports', () => {
  for (const side of ['before', 'after', 'both']) {
    const before = patrimonyFixture();
    const after = patrimonyFixture();
    for (const pack of side === 'before' ? [before] : side === 'after' ? [after] : [before, after]) {
      pack.tables = pack.tables.filter(table => table.name !== 'dev_jobs');
      pack.tableCount = pack.tables.length;
    }
    const result = comparePatrimonyExports(before, after);
    assert.equal(result.ok, false);
    assert.equal(result.identical, false);
    assert.equal(result.code, 'RESTORE_PATRIMONY_TABLE_REQUIRED');
    assert.equal(result.side, side === 'both' ? 'before' : side);
    assert.equal(result.table, 'dev_jobs');
    assert.equal(result.production_written, false);
  }
});

test('patrimony comparison rejects duplicate tables and missing or duplicate row identities', () => {
  const cases = [
    {
      code: 'RESTORE_PATRIMONY_DUPLICATE_TABLE',
      mutate(pack) { pack.tables.push(structuredClone(pack.tables[0])); pack.tableCount += 1; },
    },
    {
      code: 'RESTORE_PATRIMONY_SCHEMA_REQUIRED',
      mutate(pack) { pack.tables[0].schema = null; },
    },
    {
      code: 'RESTORE_PATRIMONY_ROW_ID_REQUIRED',
      mutate(pack) { delete pack.tables[0].rows[0].event_id; },
    },
    {
      code: 'RESTORE_PATRIMONY_DUPLICATE_ROW_ID',
      mutate(pack) { pack.tables[0].rows[1].event_id = pack.tables[0].rows[0].event_id; },
    },
  ];
  for (const { code, mutate } of cases) {
    const pack = patrimonyFixture();
    mutate(pack);
    const result = comparePatrimonyExports(pack, structuredClone(pack));
    assert.equal(result.ok, false, code);
    assert.equal(result.identical, false);
    assert.equal(result.code, code);
    assert.equal(result.side, 'before');
    assert.equal(result.table, 'evolution_ledger');
    assert.equal(result.production_written, false);
  }
});

test('patrimony comparison detects lost columns or schema constraints without exposing row contents', () => {
  const before = patrimonyFixture();
  const after = structuredClone(before);
  after.tables[0].schema = 'CREATE TABLE evolution_ledger(event_id TEXT, evidence_json TEXT)';
  const result = comparePatrimonyExports(before, after);
  assert.equal(result.ok, true);
  assert.equal(result.identical, false);
  assert.equal(result.tables.evolution_ledger.same, false);
  assert.equal(JSON.stringify(result).includes('verified'), false);
});

test('patrimony guard compares real isolated SQLite exports and detects a corrupted restored row', async () => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const { exportD1SystemState } = await import('../src/backup/system-backup-runtime.js');
  const source = sqliteD1();
  const restored = sqliteD1();
  try {
    const fixture = patrimonyFixture();
    for (const database of [source, restored]) {
      for (const table of fixture.tables) {
        await database.prepare(table.schema).run();
        for (const row of database === restored ? [...table.rows].reverse() : table.rows) {
          const columns = Object.keys(row);
          await database.prepare(
            `INSERT INTO ${table.name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`
          ).bind(...Object.values(row)).run();
        }
      }
    }
    const before = await exportD1SystemState(source, { pageSize: 1 });
    const after = await exportD1SystemState(restored, { pageSize: 1 });
    assert.equal(comparePatrimonyExports(before, after).identical, true);

    await restored.prepare('UPDATE dev_jobs SET result_json = ? WHERE id = ?').bind('lost evidence', 'j1').run();
    const corrupted = comparePatrimonyExports(before, await exportD1SystemState(restored));
    assert.equal(corrupted.ok, true);
    assert.equal(corrupted.identical, false);
    assert.equal(corrupted.tables.dev_jobs.same, false);
    assert.equal(corrupted.production_written, false);
    assert.deepEqual(await exportD1SystemState(source), before, 'the source database remains unchanged');
  } finally {
    source.close();
    restored.close();
  }
});

// MEL-FOUNDER-07: isolated restore of ledger, conversations and jobs, then
// counts and fingerprints; production is never a target.
test('an isolated copy restores ledger, conversations and jobs and matches counts and fingerprints', async () => {
  const { verifyIsolatedRestore } = await import('../src/backup/restore-service.js');
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const { exportD1SystemState } = await import('../src/backup/system-backup-runtime.js');
  const fixture = patrimonyFixture();
  const source = sqliteD1();
  const writes = [];
  try {
    for (const table of fixture.tables) {
      await source.prepare(table.schema).run();
      for (const row of table.rows) {
        const columns = Object.keys(row);
        await source.prepare(`INSERT INTO ${table.name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
      }
    }
    const exported = await exportD1SystemState(source, { pageSize: 1 });
    const isolated = sqliteD1();
    try {
      const target = { isolated: true, async restore(data) {
        writes.push('isolated');
        for (const table of data.tables) {
          await isolated.prepare(table.schema).run();
          for (const row of table.rows) {
            const columns = Object.keys(row);
            await isolated.prepare(`INSERT INTO ${table.name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
          }
        }
        return exportD1SystemState(isolated);
      } };
      const result = await verifyIsolatedRestore(exported, target);
      assert.equal(result.ok, true);
      assert.equal(result.identical, true);
      assert.equal(result.isolated, true);
      assert.equal(result.production_written, false);
      for (const name of ['evolution_ledger', 'conversations', 'dev_jobs']) {
        assert.equal(result.tables[name].before, result.tables[name].after, name);
        assert.match(result.fingerprints[name].before, /^[0-9a-f]{64}$/);
        assert.equal(result.tables[name].fingerprint_match, true, name);
      }
    } finally { isolated.close(); }
    for (const target of [null, { restore: async () => { writes.push('production'); } }, { isolated: true, production: true, restore: async () => { writes.push('production'); } }]) {
      const refused = await verifyIsolatedRestore(exported, target);
      assert.equal(refused.code, 'RESTORE_ISOLATED_TARGET_REQUIRED');
      assert.equal(refused.production_written, false);
    }
    assert.deepEqual(writes, ['isolated'], 'no write ever targets a non-isolated database');
  } finally { source.close(); }
});
