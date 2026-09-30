import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerifiedBackupService } from '../../src/backup/backup-service.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { registerRecoveryDrillCapability, runRecoveryDrillAgainstPersistedEvidence, runRecoveryDrillAgainstSnapshot, verifyPersistedEncryptedRestoreCandidate } from '../../src/capabilities/recovery-drill-capability.js';
import { createReleaseBackupBinding, runScheduledSystemBackup } from '../../src/backup/system-backup-runtime.js';
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
    async head(key){
      const bytes=rows.get(String(key));
      return bytes ? {size:bytes.byteLength} : null;
    },
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


test('GEN2-48 persisted encrypted proof is exact-bound and fails closed on metadata drift', async () => {
  const snapshot = await snapshotFixture();
  const verification = await (await import('../../src/backup/restore-service.js')).verifyRestoreCandidate(snapshot);
  assert.equal(verification.ok, true);

  const metadata = {
    id: snapshot.id,
    integritySha256: snapshot.integritySha256,
    sourceCount: snapshot.sourceCount,
    verified: true,
    encrypted: true,
    restoreVerified: true,
    restoreIntegritySha256: snapshot.integritySha256,
    restoreDeployedGitSha: verification.runtime.deployedGitSha,
    restoreTableCount: verification.database.tableCount,
    restoreRowCount: verification.database.rowCount,
    restoreR2ObjectCount: verification.r2.objectCount,
  };

  const accepted = verifyPersistedEncryptedRestoreCandidate(snapshot, metadata);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.integrity.code, 'ENCRYPTED_STORAGE_AND_PERSISTED_SNAPSHOT_VERIFIED');

  const integrityDrift = verifyPersistedEncryptedRestoreCandidate(snapshot, {
    ...metadata,
    restoreIntegritySha256: 'f'.repeat(64),
  });
  assert.equal(integrityDrift.ok, false);
  assert.equal(integrityDrift.code, 'RECOVERY_DRILL_PERSISTED_INTEGRITY_MISMATCH');

  const countDrift = verifyPersistedEncryptedRestoreCandidate(snapshot, {
    ...metadata,
    restoreRowCount: metadata.restoreRowCount + 1,
  });
  assert.equal(countDrift.ok, false);
  assert.equal(countDrift.code, 'RECOVERY_DRILL_PERSISTED_RESTORE_COUNTS_MISMATCH');

  const shaDrift = verifyPersistedEncryptedRestoreCandidate(snapshot, {
    ...metadata,
    restoreDeployedGitSha: 'b'.repeat(40),
  });
  assert.equal(shaDrift.ok, false);
  assert.equal(shaDrift.code, 'RECOVERY_DRILL_PERSISTED_RUNTIME_SHA_MISMATCH');
});


test('GEN2-48 release smoke resolves the bound snapshot by exact id even beyond the 100-row list window', async () => {
  const DB=sqliteD1();
  const MEDIA_BUCKET=bucketStorage();
  const snapshotSha='a'.repeat(40);
  const releaseSha='b'.repeat(40);
  const noiseSha='c'.repeat(40);
  const env={
    DB,
    MEDIA_BUCKET,
    MEL_RUNTIME_ENV:'production',
    MEL_DEPLOYED_GIT_SHA:snapshotSha,
    MEL_DEPLOYED_GIT_BRANCH:'release/snapshot',
    MEL_BACKUP_ENCRYPTION_KEY_ID:'recovery-bound-lookup-key',
    MEL_BACKUP_ENCRYPTION_KEY_B64:Buffer.alloc(32,11).toString('base64'),
  };
  try {
    const backup=await runScheduledSystemBackup(env,{
      force:true,
      now:()=> '2026-09-27T10:00:00.000Z',
    });
    assert.equal(backup.ok,true,JSON.stringify(backup));

    env.MEL_DEPLOYED_GIT_SHA=releaseSha;
    env.MEL_DEPLOYED_GIT_BRANCH='release/current';
    const binding=await createReleaseBackupBinding(env,{
      now:()=> '2026-09-27T10:05:00.000Z',
    });
    assert.equal(binding.ok,true,JSON.stringify(binding));
    assert.equal(binding.snapshot_id,backup.id);
    assert.equal(binding.snapshot_deployed_sha,snapshotSha);

    const baseMs=Date.parse('2026-09-27T10:06:00.000Z');
    for(let i=0;i<101;i+=1){
      const id=`noise-${String(i).padStart(3,'0')}`;
      const integrity=(i.toString(16).padStart(2,'0').repeat(32)).slice(0,64);
      const createdAt=new Date(baseMs+i*1000).toISOString();
      const metadata={
        createdAt,
        integritySha256:integrity,
        sourceCount:3,
        verified:true,
        encrypted:true,
        encryptionKeyId:env.MEL_BACKUP_ENCRYPTION_KEY_ID,
        restoreVerified:true,
        restoreCode:'RESTORE_CANDIDATE_VERIFIED',
        restoreIntegritySha256:integrity,
        restoreDeployedGitSha:noiseSha,
        restoreTableCount:1,
        restoreRowCount:0,
        restoreR2ObjectCount:0,
      };
      await DB.prepare('INSERT INTO backup_objects(id,object_key,metadata_json,created_at) VALUES(?,?,?,?)')
        .bind(id,`backups/system/${id}.enc.json`,JSON.stringify(metadata),Date.parse(createdAt))
        .run();
    }

    let handler=null;
    registerRecoveryDrillCapability({
      discover(_manifest,fn){ handler=fn; },
    },env);
    const report=await handler({approved:true},{owner:true,releaseSmoke:true});
    assert.equal(report.ok,true,JSON.stringify(report));
    assert.equal(report.state,'PASSED');
    assert.equal(report.snapshot_id,backup.id);
    assert.equal(report.deployed_sha,releaseSha);
    assert.equal(report.snapshot_deployed_sha,snapshotSha);
    assert.equal(report.release_bound,true);
  } finally {
    DB.close();
  }
});

test('GEN2-48 release smoke accepts older verified snapshot only through exact verified release binding', async () => {
  const snapshotSha='a'.repeat(40);
  const releaseSha='b'.repeat(40);
  const integrity='c'.repeat(64);
  const metadata={
    id:'release-bound-snapshot',
    objectKey:'backups/system/release-bound-snapshot.enc.json',
    integritySha256:integrity,
    restoreIntegritySha256:integrity,
    restoreDeployedGitSha:snapshotSha,
    restoreVerified:true,
    verified:true,
    encrypted:true,
    restoreTableCount:2,
    restoreRowCount:3,
    restoreR2ObjectCount:1,
  };
  const binding={
    ok:true,
    deployed_sha:releaseSha,
    snapshot_id:metadata.id,
    snapshot_integrity_sha256:integrity,
    snapshot_deployed_sha:snapshotSha,
    binding_sha256:'d'.repeat(64),
  };

  const accepted=await runRecoveryDrillAgainstPersistedEvidence(metadata,{
    owner:true,
    approved:true,
    expectedDeployedSha:releaseSha,
    releaseBinding:binding,
    backupObjectPresent:true,
    backupObjectBytes:128,
    now:()=> '2026-09-27T12:20:00.000Z',
  });
  assert.equal(accepted.ok,true);
  assert.equal(accepted.deployed_sha,releaseSha);
  assert.equal(accepted.snapshot_deployed_sha,snapshotSha);
  assert.equal(accepted.release_bound,true);
  assert.equal(accepted.release_binding_sha256,binding.binding_sha256);

  await assert.rejects(
    runRecoveryDrillAgainstPersistedEvidence(metadata,{
      owner:true,
      approved:true,
      expectedDeployedSha:releaseSha,
      releaseBinding:{...binding,snapshot_id:'wrong-snapshot'},
      backupObjectPresent:true,
      backupObjectBytes:128,
      now:()=> '2026-09-27T12:20:00.000Z',
    }),
    error=>error?.code==='RECOVERY_DRILL_PERSISTED_RUNTIME_SHA_MISMATCH',
  );
});


test('GEN2-48 release smoke uses the ephemeral release backup key without rotating the stable Worker key', async () => {
  const DB=sqliteD1();
  const MEDIA_BUCKET=bucketStorage();
  const snapshotSha='a'.repeat(40);
  const releaseSha='b'.repeat(40);
  const releaseKeyId='release-ci-backup-key';
  const releaseKeyB64=Buffer.alloc(32,21).toString('base64');
  const env={
    DB,
    MEDIA_BUCKET,
    MEL_RUNTIME_ENV:'production',
    MEL_DEPLOYED_GIT_SHA:snapshotSha,
    MEL_DEPLOYED_GIT_BRANCH:'release/snapshot',
    MEL_BACKUP_ENCRYPTION_KEY_ID:releaseKeyId,
    MEL_BACKUP_ENCRYPTION_KEY_B64:releaseKeyB64,
  };
  try {
    const backup=await runScheduledSystemBackup(env,{
      force:true,
      now:()=> '2026-09-29T12:00:00.000Z',
    });
    assert.equal(backup.ok,true,JSON.stringify(backup));

    env.MEL_DEPLOYED_GIT_SHA=releaseSha;
    env.MEL_DEPLOYED_GIT_BRANCH='release/current';
    const binding=await createReleaseBackupBinding(env,{
      now:()=> '2026-09-29T12:05:00.000Z',
    });
    assert.equal(binding.ok,true,JSON.stringify(binding));
    assert.equal(binding.snapshot_id,backup.id);

    env.MEL_BACKUP_ENCRYPTION_KEY_ID='stable-worker-key';
    env.MEL_BACKUP_ENCRYPTION_KEY_B64=Buffer.alloc(32,22).toString('base64');
    env.MEL_RELEASE_BACKUP_ENCRYPTION_KEY_ID=releaseKeyId;
    env.MEL_RELEASE_BACKUP_ENCRYPTION_KEY_B64=releaseKeyB64;

    let handler=null;
    registerRecoveryDrillCapability({
      discover(_manifest,fn){ handler=fn; },
    },env);
    const report=await handler({approved:true},{owner:true,releaseSmoke:true});
    assert.equal(report.ok,true,JSON.stringify(report));
    assert.equal(report.state,'PASSED');
    assert.equal(report.snapshot_id,backup.id);
    assert.equal(report.release_bound,true);

    delete env.MEL_RELEASE_BACKUP_ENCRYPTION_KEY_ID;
    delete env.MEL_RELEASE_BACKUP_ENCRYPTION_KEY_B64;
    await assert.rejects(
      handler({approved:true},{owner:true,releaseSmoke:true}),
      error=>error?.code==='RECOVERY_DRILL_ENCRYPTION_KEY_ID_MISMATCH',
    );
  } finally {
    DB.close();
  }
});
