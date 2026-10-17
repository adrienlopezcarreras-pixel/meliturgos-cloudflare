import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireD1WorkRunLease, releaseD1WorkRunLease, WORK_RUN_LEASE_TTL_MS } from '../src/work/d1-work-run-lease.js';

function fakeD1() {
  const leases = new Map();
  return {
    leases,
    prepare(sql) {
      const statement = String(sql).trim().replace(/\s+/g, ' ').toUpperCase();
      const run = async (params = []) => {
        if (statement.startsWith('CREATE TABLE')) return { meta: { changes: 0 } };
        if (statement.startsWith('INSERT INTO WORK_DAG_RUN_LEASES')) {
          const [id, token, until, now] = params;
          const old = leases.get(id);
          if (old && old.until > now) return { meta: { changes: 0 } };
          leases.set(id, { token, until });
          return { meta: { changes: 1 } };
        }
        if (statement.startsWith('DELETE FROM WORK_DAG_RUN_LEASES')) {
          const [id, token] = params;
          if (leases.get(id)?.token !== token) return { meta: { changes: 0 } };
          leases.delete(id);
          return { meta: { changes: 1 } };
        }
        throw Error('Unexpected SQL: ' + statement);
      };
      return {
        run: () => run(),
        bind: (...params) => ({ run: () => run(params) }),
      };
    },
  };
}

test('one D1 work-run lease wins when manual and cron resume race', async () => {
  const db = fakeD1();
  const [a, b] = await Promise.all([
    acquireD1WorkRunLease(db, 'job-1', { now: 1000, ttlMs: 5000, token: 'manual' }),
    acquireD1WorkRunLease(db, 'job-1', { now: 1000, ttlMs: 5000, token: 'cron' }),
  ]);
  assert.equal([a,b].filter(Boolean).length,1);
  assert.equal(db.leases.size,1);
  assert.equal(db.leases.get('job-1').token, a?.token || b?.token);
  assert.equal(await releaseD1WorkRunLease(db, a || b), true);
  assert.equal(db.leases.size,0);
});

test('a crashed runner expires, but its late release cannot unlock the new worker', async () => {
  const db = fakeD1();
  const stale = await acquireD1WorkRunLease(db, 'job-2', {now:1000,ttlMs:5000,token:'old'});
  assert.ok(stale);
  assert.equal(await acquireD1WorkRunLease(db, 'job-2', {now:5999,ttlMs:5000,token:'early'}),null);
  const newLease = await acquireD1WorkRunLease(db, 'job-2', {now:6000,ttlMs:5000,token:'new'});
  assert.equal(newLease.token,'new');
  assert.equal(await releaseD1WorkRunLease(db,stale),false);
  assert.equal(db.leases.get('job-2').token,'new');
  assert.equal(await releaseD1WorkRunLease(db,newLease),true);
});

test('different jobs use independent atomic leases', async () => {
  const db=fakeD1();
  const a=await acquireD1WorkRunLease(db,'a',{now:20,ttlMs:1000,token:'a-token'});
  const b=await acquireD1WorkRunLease(db,'b',{now:20,ttlMs:1000,token:'b-token'});
  assert.ok(a);
  assert.ok(b);
  assert.equal(db.leases.size,2);
});

test('lease acquisition fails closed on invalid TTL or unverifiable database write', async () => {
  const db=fakeD1();
  await assert.rejects(acquireD1WorkRunLease(db,'job',{now:0,ttlMs:WORK_RUN_LEASE_TTL_MS+1,token:'x'}),{code:'WORK_DAG_LEASE_TIME_INVALID'});
  await assert.rejects(acquireD1WorkRunLease(db,'job',{now:0,ttlMs:0,token:'x'}),{code:'WORK_DAG_LEASE_TIME_INVALID'});
  const unverified={prepare:()=>({run:async()=>({}),bind:()=>({run:async()=>({})})})};
  await assert.rejects(acquireD1WorkRunLease(unverified,'job',{now:0,ttlMs:1000,token:'x'}),{code:'WORK_DAG_LEASE_WRITE_UNVERIFIED'});
});
