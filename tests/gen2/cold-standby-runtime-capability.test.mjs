import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerifiedBackupService } from '../../src/backup/backup-service.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { prepareColdStandbyAgainstSnapshot } from '../../src/capabilities/cold-standby-capability.js';

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
    now: () => '2026-09-25T14:00:00.000Z',
    sources: {
      database: async () => ({
        type: 'MEL_D1_LOGICAL_EXPORT_V1',
        tableCount: 2,
        tables: [
          { name: 'memories', schema: 'CREATE TABLE memories(id TEXT)', rowCount: 1, rows: [{ id: 'm1' }] },
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
        deployedGitSha: 'b'.repeat(40),
        deployedGitBranch: 'release/mel-hardware-v0.1.0',
      }),
    },
  });
  const created = await backups.create({ id: 'cold-standby-fixture' });
  return storage.rows.get(created.id);
}

const destination = {
  id: 'cold-store-eu-1',
  provider: 'provider-neutral',
  location_hint: 'owner-authorized encrypted cold storage',
  authorized: true,
  encrypted: true,
};

test('MEL-RES-04 prepares a manual-only cold standby after a passed recovery drill', async () => {
  const snapshot = await snapshotFixture();
  const result = await prepareColdStandbyAgainstSnapshot(snapshot, {
    owner: true,
    approved: true,
    destination,
    now: () => '2026-09-25T14:05:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'PREPARED_MANUAL_COLD_STANDBY');
  assert.equal(result.plan.state, 'READY');
  assert.equal(result.plan.activation_allowed, false);
  assert.equal(result.plan.activation_mode, 'MANUAL');
  assert.equal(result.activation_performed, false);
  assert.equal(result.automatic_activation, false);
  assert.equal(result.manual_activation_required, true);
  assert.equal(result.recovery_drill.state, 'PASSED');
  assert.equal(result.recovery_drill.production_access_used, false);
  assert.equal(result.recovery_drill.activation_performed, false);
  assert.equal(result.recovery_drill.teardown_completed, true);
});
test('MEL-RES-04 requires owner and explicit approval', async () => {
  const snapshot = await snapshotFixture();

  await assert.rejects(
    prepareColdStandbyAgainstSnapshot(snapshot, {
      owner: false,
      approved: true,
      destination,
    }),
    error => error?.code === 'COLD_STANDBY_OWNER_REQUIRED',
  );

  await assert.rejects(
    prepareColdStandbyAgainstSnapshot(snapshot, {
      owner: true,
      approved: false,
      destination,
    }),
    error => error?.code === 'COLD_STANDBY_EXPLICIT_APPROVAL_REQUIRED',
  );
});

test('MEL-RES-04 refuses unauthorized or unencrypted destinations', async () => {
  const snapshot = await snapshotFixture();

  await assert.rejects(
    prepareColdStandbyAgainstSnapshot(snapshot, {
      owner: true,
      approved: true,
      destination: { ...destination, authorized: false },
    }),
    error => error?.code === 'COLD_STANDBY_AUTHORIZED_DESTINATION_REQUIRED',
  );

  await assert.rejects(
    prepareColdStandbyAgainstSnapshot(snapshot, {
      owner: true,
      approved: true,
      destination: { ...destination, encrypted: false },
    }),
    error => error?.code === 'COLD_STANDBY_ENCRYPTED_DESTINATION_REQUIRED',
  );
});

test('MEL-RES-04 exposes prepare capability but no activation capability', () => {
  const runtime = createGen2Runtime({ env: {} });
  const prepare = runtime.bus.list().find(row => row.id === 'resilience.cold-standby.prepare.latest');
  assert.ok(prepare);
  assert.equal(prepare.category, 'resilience');
  assert.equal(prepare.risk, 'LOW');
  assert.equal(prepare.health, 'UNAVAILABLE');
  assert.equal(runtime.bus.list().some(row => row.id === 'resilience.cold-standby.activate'), false);
});
