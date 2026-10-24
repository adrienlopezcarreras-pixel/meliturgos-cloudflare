import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMaintenanceStorage, prepareGlobalReset, validateMaintenanceAuthorization, retireLegacyDevJobs, resetWatchDiscoveryProjection, retireRevenueDiscoveries, inspectWorkDagsForReset, assertNoActiveWorkLeases, globalCleanupReadiness, inspectBackupReadiness } from '../../src/maintenance/global-reset.js';

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
      async first() { return sql.includes('work_dag_run_leases') ? null : {n:27}; }
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

test('legacy supervised jobs cancel and epoch update atomically after verified gate', async () => {
  const calls=[];
  const store={
    prepare(sql){calls.push(sql);return {
      first:async()=>({n:3}),
      bind(...args){return {sql,args};}
    };},
    async batch(statements){
      assert.equal(statements.length,2);
      assert.match(statements[0].sql,/status='CANCELLED'/);
      assert.match(statements[1].sql,/dev_bridge_state/);
      assert.equal(statements[1].args[0],'activity-list-epoch');
      return [{meta:{changes:3}},{meta:{changes:1}}];
    }
  };
  await assert.rejects(retireLegacyDevJobs(store,{owner_approved:true,producers_paused:true,backup:{verified:true}}),/RESTORE_POINT/);
  assert.equal(calls.length,0);
  const out=await retireLegacyDevJobs(store,{owner_approved:true,producers_paused:true,backup},{now:1792870000000});
  assert.equal(out.changed,3);
  assert.equal(out.history_deleted,false);
  assert.ok(calls.some(x=>x.includes("status IN ('QUEUED','CLAIMED'")));
});

test('watch reset archives old ledger and updates active projection atomically', async () => {
  const statements=[];let batchCount=0;
  const store={
    prepare(sql){return {bind(...args){return {sql,args,first:async()=>({state_json:JSON.stringify({items:[{id:'past'}]})}),run:async()=>({meta:{changes:1}})};},first:async()=>({state_json:JSON.stringify({items:[{id:'past'}]})}),run:async()=>({})};},
    async batch(queries){batchCount++;statements.push(...queries);return [{meta:{changes:1}},{meta:{changes:1}}];}
  };
  const out=await resetWatchDiscoveryProjection(store,{owner_approved:true,producers_paused:true,backup},{now:1792870000000});
  assert.equal(out.active_discoveries,0);
  assert.equal(batchCount,1);
  assert.equal(statements.length,2);
  assert.equal(JSON.parse(statements[1].args[0]).items.length,0);
});
test('revenue discovery cleanup only marks non-delivered discovery rows', async () => {
  const sql=[];
  const store={prepare(statement){sql.push(statement);return {first:async()=>({name:'revenue_watch'}),run:async()=>({meta:{changes:2}})};}};
  const result=await retireRevenueDiscoveries(store,{owner_approved:true,producers_paused:true,backup});
  assert.equal(result.changed,2);
  assert.match(sql[1], /WHERE status IN \('NEW','DISCOVERY_ONLY'\)/);
  assert.equal(result.historic_rows_deleted,0);
});

test('empty watch ledger is a no-op and does not create an archive', async () => {
  let writes = 0;
  const store = { prepare(sql) { return {
    bind(){return {first: async () => null,run:async()=>{writes++;return {}}};},
    run:async()=>{writes++;return {}}
  };}};
  const out=await resetWatchDiscoveryProjection(store,{owner_approved:true,producers_paused:true,backup});
  assert.equal(out.status,'EMPTY');
  assert.equal(writes,0);
});
test('WORK inventory never updates integrity-signed DAG records', async () => {
  const seen=[];
  const store={prepare(sql){seen.push(sql);return {
    first:async()=>({name:'work_dags'}),
    all:async()=>({results:[{status:'RUNNING',n:2},{status:'COMPLETED',n:3}]})
  };}};
  const result=await inspectWorkDagsForReset(store);
  assert.equal(result.total,5);
  assert.equal(result.statuses[0].count,2);
  assert.ok(seen.every(sql=>/^(SELECT)/.test(sql)));
});

test('global reset denies active WORK writer leases and accepts expired leases', async () => {
  const leaseDb = count => ({prepare(sql) {return {
    first:async()=>({name:'work_dag_run_leases'}),
    bind() {return {first:async()=>({n:count})};}
  };}});
  await assert.rejects(assertNoActiveWorkLeases(leaseDb(1),{now:10}), /WORK_LEASES_ACTIVE/);
  assert.deepEqual(await assertNoActiveWorkLeases(leaseDb(0),{now:10}), {active:0,status:'NO_ACTIVE_WORK_LEASES'});
});

test('maintenance inspection route is authenticated and read-only', async () => {
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../../src/evolution/autonomy-api.js', import.meta.url), 'utf8');
  assert.match(source, /isMaintenanceInspect/);
  const authPos = source.indexOf('const auth = requireAuth(request, env)');
  const handlerPos = source.indexOf('if (isMaintenanceInspect) {');
  assert.ok(authPos >= 0 && handlerPos > authPos);
  const handler = source.slice(handlerPos, source.indexOf('if (isActivityReset)', handlerPos));
  assert.match(handler, /reset_available:false/);
  assert.doesNotMatch(handler, /DELETE FROM|UPDATE dev_jobs|retireLegacyDevJobs/);
});

test('readiness remains false until ALL independently proven domains are ready',()=>{
 const result=globalCleanupReadiness();
 assert.equal(result.ready,false);
 assert.ok(result.blockers.includes('RESTORE_TEST_NOT_VERIFIED'));
 assert.ok(result.blockers.includes('DOMAIN_RESET_NOT_PROVEN:WORK'));
 assert.ok(result.blockers.includes('DOMAIN_RESET_NOT_PROVEN:MENTOR'));
});

test('backup integrity cannot be confused with isolated restore proof', async () => {
  const service={list:async()=>[{id:'snapshot-1',createdAt:'2026-10-24T00:00:00Z'}],verify:async()=>({ok:true})};
  const result=await inspectBackupReadiness(service);
  assert.equal(result.verified,true);
  assert.equal(result.restore_tested,false);
  assert.equal(result.status,'BACKUP_INTEGRITY_VERIFIED_RESTORE_UNPROVEN');
  assert.equal((await inspectBackupReadiness(null)).verified,false);
  assert.equal((await inspectBackupReadiness({list:async()=>[],verify:async()=>({ok:true})})).status,'NO_BACKUP_SNAPSHOT');
});
