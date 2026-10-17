import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createWorkDag } from '../src/work/work-dag.js';
import { D1WorkDagStore } from '../src/work/d1-work-dag-store.js';
import { acquireD1WorkRunLease, releaseD1WorkRunLease } from '../src/work/d1-work-run-lease.js';

test('old Work DAG writer cannot replace successor checkpoint after lease takeover', async () => {
  const db = sqliteD1();
  const id = 'leased-work-dag-proof';
  try {
    const created = createWorkDag({
      id, jobId: id, goal: 'checkpoint owned by a run lease',
      nodes: [{ id:'one', kind:'TASK', idempotent:true, payload:{capability:'echo', input:{value:'safe'}} }],
    });
    const initial = new D1WorkDagStore(db,id);
    await initial.createNew(created);
    const old = await acquireD1WorkRunLease(db,id,{now:Date.now(),ttlMs:1000,token:'old-worker'});
    assert.ok(old);
    const staleStore = new D1WorkDagStore(db,id);
    staleStore.bindRunLease(old);
    const first = await staleStore.load();
    first.goal = 'old worker checkpoint';
    await staleStore.save(first);
    assert.equal((await initial.load()).goal,'old worker checkpoint');

    const successor = await acquireD1WorkRunLease(db,id,{now:Date.now()+2000,ttlMs:5000,token:'new-worker'});
    assert.equal(successor.token,'new-worker');
    const newStore = new D1WorkDagStore(db,id);
    newStore.bindRunLease(successor);
    const newer = await newStore.load();
    newer.goal = 'verified successor checkpoint';
    await newStore.save(newer);
    const stolen = await staleStore.load();
    stolen.goal = 'stale overwrite attempted';
    await assert.rejects(() => staleStore.save(stolen), {code:'WORK_DAG_LEASE_LOST'});
    assert.equal((await initial.load()).goal,'verified successor checkpoint');
    assert.equal(await releaseD1WorkRunLease(db,old),false);
    assert.equal(await releaseD1WorkRunLease(db,successor),true);
  } finally { db.close(); }
});

test('leased Work DAG persistence fails closed on expired lease or missing ownership', async () => {
  const db=sqliteD1();
  const id='expired-dag-write-proof';
  try {
    const dag=createWorkDag({
      id,jobId:id,goal:'no stale commits',
      nodes:[{id:'one',kind:'TASK',idempotent:true}],
    });
    const store=new D1WorkDagStore(db,id);
    await store.createNew(dag);
    const old=await acquireD1WorkRunLease(db,id,{now:Date.now()-5000,ttlMs:1000,token:'expired'});
    assert.ok(old);
    const bound=new D1WorkDagStore(db,id);
    bound.bindRunLease(old);
    const update=await bound.load();
    update.goal='must remain unchanged';
    await assert.rejects(()=>bound.save(update),{code:'WORK_DAG_LEASE_LOST'});
    assert.equal((await store.load()).goal,'no stale commits');
    assert.throws(()=>bound.bindRunLease({dagId:'another-job',token:'x'}),{code:'WORK_DAG_LEASE_ID_MISMATCH'});
  } finally { db.close(); }
});
