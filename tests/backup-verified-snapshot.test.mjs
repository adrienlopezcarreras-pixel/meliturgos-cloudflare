import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VERIFIED_SNAPSHOT_SCHEMA,
  createVerifiedBackupService,
  verifySnapshot,
} from '../src/backup/backup-service.js';

function memoryStorage() {
  const rows = new Map();
  return {
    rows,
    async put(snapshot) { rows.set(snapshot.id, structuredClone(snapshot)); },
    async get(id) { return rows.has(id) ? structuredClone(rows.get(id)) : null; },
    async list() { return [...rows.values()].map(({ id, createdAt, integritySha256 }) => ({ id, createdAt, integritySha256 })); },
  };
}

test('GEN2-47 creates one complete verified snapshot before persistence', async () => {
  const storage = memoryStorage();
  const service = createVerifiedBackupService({
    sources: {
      memory: async () => ({ facts: ['a', 'b'], token: 'must-not-leak' }),
      roadmap: async () => ({ head: 'abc123', status: 'ok' }),
    },
    storage,
    now: () => '2026-09-16T10:30:00.000Z',
  });

  const created = await service.create({ id: 'gen2-47-snapshot' }, { requestId: 'req-1' });
  assert.equal(created.schema, VERIFIED_SNAPSHOT_SCHEMA);
  assert.equal(created.verified, true);
  assert.equal(created.sourceCount, 2);
  assert.equal(storage.rows.size, 1);

  const stored = storage.rows.get(created.id);
  assert.deepEqual(stored.entries.map(row => row.name), ['memory', 'roadmap']);
  assert.equal(stored.exports.memory.token, '[REDACTED]');

  const verified = await service.verify({ id: created.id });
  assert.deepEqual(verified, {
    ok: true,
    id: created.id,
    integritySha256: created.integritySha256,
    sourceCount: 2,
  });
});

test('GEN2-47 rejects tampering in an exported source', async () => {
  const storage = memoryStorage();
  const service = createVerifiedBackupService({
    sources: { state: async () => ({ version: 1, jobs: ['a'] }) },
    storage,
    now: () => '2026-09-16T10:31:00.000Z',
  });

  const created = await service.create({ id: 'tamper-test' });
  const snapshot = structuredClone(storage.rows.get(created.id));
  snapshot.exports.state.jobs.push('injected');

  const result = await verifySnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SNAPSHOT_ENTRY_INTEGRITY_MISMATCH');
  assert.equal(result.source, 'state');
});

test('GEN2-47 never persists a partial snapshot when one exporter fails', async () => {
  const storage = memoryStorage();
  const service = createVerifiedBackupService({
    sources: {
      first: async () => ({ ok: true }),
      second: async () => { throw new Error('EXPORT_FAILED'); },
    },
    storage,
  });

  await assert.rejects(() => service.create({ id: 'partial' }), /EXPORT_FAILED/);
  assert.equal(storage.rows.size, 0);
});

test('GEN2-47 fails closed for incomplete manifests and missing snapshots', async () => {
  assert.deepEqual(await verifySnapshot({ schema: VERIFIED_SNAPSHOT_SCHEMA }), {
    ok: false,
    code: 'SNAPSHOT_MANIFEST_INCOMPLETE',
  });

  const storage = memoryStorage();
  const service = createVerifiedBackupService({
    sources: { state: async () => ({ ok: true }) },
    storage,
  });
  assert.deepEqual(await service.verify({ id: 'missing' }), { ok: false, code: 'SNAPSHOT_NOT_FOUND' });
});

test('GEN2-47 lists only storage-provided snapshot metadata', async () => {
  const storage = memoryStorage();
  const service = createVerifiedBackupService({
    sources: { state: async () => ({ ok: true }) },
    storage,
    now: () => '2026-09-16T10:32:00.000Z',
  });

  const created = await service.create({ id: 'listed' });
  assert.deepEqual(await service.list(), [{
    id: 'listed',
    createdAt: '2026-09-16T10:32:00.000Z',
    integritySha256: created.integritySha256,
  }]);
});
