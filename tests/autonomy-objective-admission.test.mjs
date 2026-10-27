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
