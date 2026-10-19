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
    schema: 'CREATE TABLE ' + name + '(id TEXT)',
    rowCount: ids.length,
    rows: ids.map(id => ({ id })),
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
      schema: 'CREATE TABLE ' + name + '(id TEXT)',
      rowCount: ids.length,
      rows: ids.map(id => ({ id })),
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
