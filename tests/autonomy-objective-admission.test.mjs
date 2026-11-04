import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

for (const persistent of [false,true]) test(`active objective admission is atomic across different IDs (${persistent?'D1':'memory'})`,async()=>{
  const db=persistent?sqliteD1():null;
  try {
    const repo=new D1DevJobRepository(db);
    const input=id=>({id,goal:'same objective',requested_by:'mel-autonomy',optional_context:{roadmap_id:'MEL-FOUNDER-01'}});
    const results=await Promise.all([repo.createIfAbsent(input('original')),repo.createIfAbsent(input('duplicate'))]);
    assert.equal(results.filter(row=>row.created).length,1);
    assert.equal(results[0].job.id,results[1].job.id);
    assert.equal((await repo.list()).length,1);
    await repo.update(results[0].job.id,{status:'CANCELLED'});
    assert.equal((await repo.createIfAbsent(input('new-after-owner-cancellation'))).created,true);
  } finally {db?.close();}
});
for (const persistent of [false,true]) test(`revenue queue never admits a fourth active job (${persistent?'D1':'memory'})`,async()=>{
  const db=persistent?sqliteD1():null;
  try {
    const repo=new D1DevJobRepository(db);
    const input=id=>({id,goal:'funded source',requested_by:'mel-autonomy',optional_context:{source:'revenue-watch'}});
    const results=await Promise.allSettled(Array.from({length:5},(_,i)=>repo.createIfAbsent(input('revenue-'+i))));
    assert.equal(results.filter(row=>row.status==='fulfilled').length,3);
    for(const row of results.filter(row=>row.status==='rejected'))assert.equal(row.reason.code,'REVENUE_WATCH_QUEUE_FULL');
    await repo.update('revenue-0',{status:'COMPLETED'});
    assert.equal((await repo.createIfAbsent(input('replacement'))).created,true);
  } finally {db?.close();}
});

for (const persistent of [false, true]) test(`error-ledger obeys the global MAX slot even without roadmap_id (${persistent ? 'D1' : 'memory'})`, async () => {
  const db = persistent ? sqliteD1() : null;
  try {
    const repo = new D1DevJobRepository(db);
    const manifest = { id: 'manifest', requested_by: 'mel-autonomy', goal: 'manifest',
      optional_context: { roadmap_id: 'MEL-MANIFEST-01', source: 'autonomy-supervisor' } };
    const repair = id => ({ id, requested_by: 'mel-autonomy', goal: 'repair',
      optional_context: { source: 'error-ledger', roadmap_id: null } });
    await repo.create(manifest);
    await repo.update(manifest.id, { status: 'WAITING_TEACHER' });
    // A missing roadmap_id must NOT bypass admission or be aliased to manifest.
    await assert.rejects(repo.createIfAbsent(repair('error-ledger-1')), { code: 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' });
    assert.equal(await repo.get('error-ledger-1'), null);
    assert.equal((await repo.get('manifest')).status, 'WAITING_TEACHER');

    await repo.update('manifest', { status: 'CANCELLED' });
    const admitted = await repo.createIfAbsent(repair('error-ledger-1'));
    assert.equal(admitted.created, true);
    assert.equal(admitted.job.id, 'error-ledger-1');
    await repo.update('error-ledger-1', { status: 'TEACHER_APPROVED' });
    // Reverse ordering: a live repair blocks another roadmap objective too.
    await assert.rejects(repo.create({ ...manifest, id: 'new-manifest' }),
      { code: 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' });
    await assert.rejects(repo.createIfAbsent(repair('error-ledger-2')),
      { code: 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' });
    assert.equal(await repo.get('error-ledger-2'), null);
    assert.equal((await repo.get('error-ledger-1')).status, 'TEACHER_APPROVED');
  } finally { db?.close(); }
});

for (const persistent of [false, true]) test(`concurrent MAX roadmap and error repair admits only one mission (${persistent ? 'D1' : 'memory'})`, async () => {
  const db = persistent ? sqliteD1() : null;
  try {
    const repo = new D1DevJobRepository(db);
    const jobs = [
      { id: 'manifest-race', requested_by: 'mel-autonomy', goal: 'manifest',
        optional_context: { roadmap_id: 'MEL-MANIFEST-01', source: 'autonomy-supervisor' } },
      { id: 'error-ledger-race', requested_by: 'mel-autonomy', goal: 'repair',
        optional_context: { source: 'error-ledger' } },
    ];
    const results = await Promise.allSettled(jobs.map(job => repo.create(job)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await repo.list()).length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE');
  } finally { db?.close(); }
});
