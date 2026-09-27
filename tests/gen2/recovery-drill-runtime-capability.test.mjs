import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerifiedBackupService } from '../../src/backup/backup-service.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { registerRecoveryDrillCapability, runRecoveryDrillAgainstSnapshot } from '../../src/capabilities/recovery-drill-capability.js';
import { runScheduledSystemBackup } from '../../src/backup/system-backup-runtime.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function memoryStorage() {
  const rows = new Map();
  return {
    rows,
    async put(snapshot) { rows.set(snapshot.id, structuredClone(snapshot)); },
    async get(id) { return rows.has(id) ? structuredClone(rows.get(id)) : null; },
    async list() { return [...rows.values()]; },
  };
}

async function snapshotFixture() {
  const storage = memoryStorage();
  const backups = createVerifiedBackupService({
    storage,
    now: () => '2026-09-25T12:00:00.000Z',
    sources: {
      database: async () => ({
        type: 'MEL_D1_LOGICAL_EXPORT_V1',
        tableCount: 2,
        tables: [
          { name: 'memories', schema: 'CREATE TABLE memories(id TEXT)', rowCount: 2, rows: [{ id: 'm1' }, { id: 'm2' }] },
          { name: 'projects', schema: 'CREATE TABLE projects(id TEXT)', rowCount: 1, rows: [{ id: 'p1' }] },
        ],
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
        deployedGitSha: 'a'.repeat(40),
        deployedGitBranch: 'release/mel-hardware-v0.1.0',
      }),
    },
  });
  const created = await backups.create({ id: 'runtime-drill-fixture' });
  return storage.rows.get(created.id);
}
test('GEN2-48 runtime drill reconstructs verified logical state without production activation', async () => {
  const snapshot = await snapshotFixture();
  let verifyCalls = 0;
  const report = await runRecoveryDrillAgainstSnapshot(snapshot, {
    verifyCandidate: async (value) => {
      verifyCalls += 1;
      return (await import('../../src/backup/restore-service.js')).verifyRestoreCandidate(value);
    },
    owner: true,
    approved: true,
    now: () => '2026-09-25T12:05:00.000Z',
  });

  assert.equal(report.ok, true);
  assert.equal(report.state, 'PASSED');
  assert.equal(report.snapshot_id, snapshot.id);
  assert.equal(report.restore_candidate_verified, true);
  assert.equal(report.reconstructed_tables, 2);
  assert.equal(report.reconstructed_rows, 3);
  assert.equal(report.production_access_used, false);
  assert.equal(report.activation_performed, false);
  assert.equal(report.teardown_completed, true);
  assert.equal(report.deployed_sha, 'a'.repeat(40));
  assert.ok(report.checks.every((row) => row.ok));
  assert.equal(verifyCalls, 1);
});

test('GEN2-48 runtime drill requires explicit approval even though it is non-destructive', async () => {
  const snapshot = await snapshotFixture();
  await assert.rejects(
    runRecoveryDrillAgainstSnapshot(snapshot, {
      owner: true,
      approved: false,
      now: () => '2026-09-25T12:05:00.000Z',
    }),
    (error) => error?.code === 'EXACT_DRILL_APPROVAL_REQUIRED',
  );
});

test('GEN2-48 runtime drill rejects a tampered system snapshot before staging', async () => {
  const snapshot = await snapshotFixture();
  snapshot.exports.database.tables[0].rows.push({ id: 'tampered' });
  await assert.rejects(
    runRecoveryDrillAgainstSnapshot(snapshot, {
      owner: true,
      approved: true,
      now: () => '2026-09-25T12:05:00.000Z',
    }),
    /SNAPSHOT_ENTRY_INTEGRITY_MISMATCH|SNAPSHOT_INTEGRITY_MISMATCH/,
  );
});

test('GEN2-48 runtime exposes the latest-backup drill through CapabilityBus', () => {
  const runtime = createGen2Runtime({ env: {} });
  const capability = runtime.bus.list().find((row) => row.id === 'resilience.recovery.drill.latest');
  assert.ok(capability);
  assert.equal(capability.category, 'resilience');
  assert.equal(capability.risk, 'LOW');
  assert.equal(capability.health, 'UNAVAILABLE');
  assert.deepEqual(capability.permissions, []);
});


function bucketStorage() {
  const rows=new Map();
  return {
    async put(key,value){
      let bytes;
      if(value instanceof Uint8Array) bytes=value;
      else if(value instanceof ArrayBuffer) bytes=new Uint8Array(value);
      else bytes=new TextEncoder().encode(String(value));
      rows.set(String(key),bytes);
    },
    async get(key){
      const bytes=rows.get(String(key));
      if(!bytes) return null;
      return {
        async text(){ return new TextDecoder().decode(bytes); },
        async arrayBuffer(){ return bytes.slice().buffer; },
      };
    },
    async delete(key){ rows.delete(String(key)); },
    async list({prefix=''}={}){
      return {
        objects:[...rows.entries()]
          .filter(([key])=>key.startsWith(String(prefix||'')))
          .map(([key,bytes])=>({key,size:bytes.byteLength,etag:'test',uploaded:new Date(0)})),
        truncated:false,
      };
    },
  };
}

test('GEN2-48 latest recovery drill reads an encrypted system backup with the canonical env codec', async () => {
  const DB=sqliteD1();
  const MEDIA_BUCKET=bucketStorage();
  const env={
    DB,
    MEDIA_BUCKET,
    MEL_RUNTIME_ENV:'production',
    MEL_DEPLOYED_GIT_SHA:'b'.repeat(40),
    MEL_DEPLOYED_GIT_BRANCH:'release/test',
    MEL_BACKUP_ENCRYPTION_KEY_ID:'recovery-drill-test-key',
    MEL_BACKUP_ENCRYPTION_KEY_B64:Buffer.alloc(32,9).toString('base64'),
  };
  try {
    const backup=await runScheduledSystemBackup(env,{
      force:true,
      now:()=> '2026-09-27T11:45:00.000Z',
    });
    assert.equal(backup.ok,true,JSON.stringify(backup));

    let handler=null;
    const bus={
      discover(_manifest,fn){ handler=fn; },
    };
    registerRecoveryDrillCapability(bus,env);
    assert.equal(typeof handler,'function');

    const report=await handler({approved:true},{owner:true});
    assert.equal(report.ok,true);
    assert.equal(report.state,'PASSED');
    assert.equal(report.snapshot_id,backup.id);
    assert.equal(report.restore_candidate_verified,true);
    assert.equal(report.production_access_used,false);
    assert.equal(report.activation_performed,false);
  } finally {
    DB.close();
  }
});

test('GEN2-48 recovery drill fails closed on partial backup encryption configuration', async () => {
  const DB=sqliteD1();
  const MEDIA_BUCKET=bucketStorage();
  try {
    let handler=null;
    registerRecoveryDrillCapability({
      discover(_manifest,fn){ handler=fn; },
    },{
      DB,
      MEDIA_BUCKET,
      MEL_BACKUP_ENCRYPTION_KEY_ID:'missing-key-material',
    });
    await assert.rejects(
      handler({approved:true},{owner:true}),
      error=>error?.code==='BACKUP_ENCRYPTION_CONFIG_INCOMPLETE',
    );
  } finally {
    DB.close();
  }
});
