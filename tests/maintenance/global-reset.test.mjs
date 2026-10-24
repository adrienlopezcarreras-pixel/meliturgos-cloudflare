import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMaintenanceStorage, prepareGlobalReset, validateMaintenanceAuthorization } from '../../src/maintenance/global-reset.js';

const backup = { verified:true, restore_tested:true, reference:'isolated-restore-proof', sha256:'a'.repeat(64) };
const db = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async first() {
            if (sql.includes('sqlite_master')) return values[1] === 'dev_jobs' ? {name:'dev_jobs'} : null;
            return {n:27};
          }
        };
      },
      async first() { return {n:27}; }
    };
  }
};
test('global reset refuses missing approval, pause or independently tested restore', async () => {
  assert.throws(() => validateMaintenanceAuthorization({}), /APPROVAL/);
  assert.throws(() => validateMaintenanceAuthorization({owner_approved:true}), /PAUSED/);
  assert.throws(() => validateMaintenanceAuthorization({owner_approved:true, producers_paused:true, backup:{verified:true}}), /RESTORE_POINT/);
});
test('global reset inventories safely without changing persistent state', async () => {
  const snapshot = await inspectMaintenanceStorage(db);
  assert.equal(snapshot.tables.dev_jobs.rows, 27);
  assert.equal(snapshot.tables.work_dags.exists, false);
  const plan = await prepareGlobalReset(db, {owner_approved:true, producers_paused:true, backup});
  assert.equal(plan.mode,'PREFLIGHT_ONLY');
  assert.equal(plan.mutated,false);
  assert.equal(plan.pending.length,7);
  assert.ok(plan.preserves.includes('DONE_VERIFIED'));
});
