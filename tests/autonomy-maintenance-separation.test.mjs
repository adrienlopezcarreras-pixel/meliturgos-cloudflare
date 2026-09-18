import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutonomyMaintenance } from '../src/evolution/autonomy-runtime.js';

test('autonomy maintenance requires durable state unless a repository is explicitly injected', async () => {
  await assert.rejects(
    () => runAutonomyMaintenance({}),
    (error) => error?.code === 'AUTONOMY_MAINTENANCE_DB_REQUIRED',
  );
});

test('autonomy maintenance runs hygiene and recovery through an explicit repository', async () => {
  let listCalls = 0;
  const repository = {
    async list() {
      listCalls += 1;
      return [];
    },
    async update() {
      throw new Error('empty maintenance fixture must not update jobs');
    },
  };

  const result = await runAutonomyMaintenance({}, { repository });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'MAINTENANCE_COMPLETE');
  assert.equal(result.queue_hygiene?.attempted, 0);
  assert.equal(result.passive_recovery?.attempted, 0);
  assert.equal(listCalls, 2);
});

test('maintenance fallback lease is scoped to one run and released', async () => {
  const leaseStore = new Map();
  const repository = {
    async list() { return []; },
    async update() { throw new Error('no update expected'); },
  };

  const first = await runAutonomyMaintenance({}, {
    repository,
    runtimeLeaseOwner: 'maintenance-one',
    runtimeLeaseStore: leaseStore,
  });
  assert.equal(first.status, 'MAINTENANCE_COMPLETE');
  assert.equal(leaseStore.size, 0);

  const second = await runAutonomyMaintenance({}, {
    repository,
    runtimeLeaseOwner: 'maintenance-two',
    runtimeLeaseStore: leaseStore,
  });
  assert.equal(second.status, 'MAINTENANCE_COMPLETE');
  assert.equal(leaseStore.size, 0);
});
