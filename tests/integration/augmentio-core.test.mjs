import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderAdapter, ProviderPool, ZeroEuroGovernor, QuotaArbitrator, ComputeCache, ParallelScheduler, ResultTournament, buildTeacherEscalation } from '../../src/augmentio/core.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

test('parallel fan-out runs independent zero-cost providers concurrently', async () => {
  const pool = new ProviderPool([
    new ProviderAdapter({providerId:'p1',modelId:'m1',capabilities:['GENERAL'],invoke:async()=>{await wait(60); return 'alpha';}}),
    new ProviderAdapter({providerId:'p2',modelId:'m2',capabilities:['GENERAL'],invoke:async()=>{await wait(60); return 'beta';}}),
    new ProviderAdapter({providerId:'p3',modelId:'m3',capabilities:['GENERAL'],invoke:async()=>{await wait(60); return 'gamma';}})
  ]);
  const scheduler = new ParallelScheduler({pool,globalConcurrency:3});
  const started=Date.now(); const out=await scheduler.run({input:{q:'x'},fanout:3});
  assert.equal(out.candidates.length,3); assert.ok(Date.now()-started < 150); assert.equal(out.cacheHit,false);
});

test('zero euro governor blocks non-zero-cost adapters', async () => {
  const pool = new ProviderPool([
    {providerId:'free',modelId:'a',capabilities:['GENERAL'],costPerCall:0,invoke:async()=> 'free'},
    {providerId:'paid',modelId:'b',capabilities:['GENERAL'],costPerCall:0.01,invoke:async()=> 'paid'}
  ]);
  const out=await new ParallelScheduler({pool,governor:new ZeroEuroGovernor(0)}).run({input:'x',fanout:5});
  assert.deepEqual(out.candidates.map(c=>c.providerId),['free']);
});

test('rate limited provider cools down and fallback remains available', async () => {
  let now=1000; const quota=new QuotaArbitrator({cooldownMs:100,now:()=>now});
  const pool=new ProviderPool([
    {providerId:'limited',modelId:'x',capabilities:['GENERAL'],invoke:async()=>{const e=new Error('rate');e.status=429;throw e;}},
    {providerId:'fallback',modelId:'y',capabilities:['GENERAL'],invoke:async()=> 'ok'}
  ]);
  const scheduler=new ParallelScheduler({pool,quota,globalConcurrency:2});
  const first=await scheduler.run({input:'first',fanout:2}); assert.equal(first.text,'ok');
  const second=await scheduler.run({input:'second',fanout:2}); assert.deepEqual(second.candidates.map(c=>c.providerId),['fallback']);
  now+=101; assert.equal(quota.available(pool.list().find(a=>a.providerId==='limited')),true);
});

test('cache suppresses duplicate compute', async () => {
  let calls=0; const pool=new ProviderPool([{providerId:'p',modelId:'m',capabilities:['GENERAL'],invoke:async()=>{calls++;return 'same';}}]);
  const scheduler=new ParallelScheduler({pool,cache:new ComputeCache({ttlMs:1000})});
  await scheduler.run({input:{q:1}}); const two=await scheduler.run({input:{q:1}});
  assert.equal(calls,1); assert.equal(two.cacheHit,true);
});

test('tournament deduplicates identical outputs and teacher escalation includes provenance', () => {
  const tournament=new ResultTournament().select([
    {text:'same answer',providerId:'a',modelId:'1',evidence:true},
    {text:' same   answer ',providerId:'b',modelId:'2'},
    {text:'different',providerId:'c',modelId:'3'}
  ]);
  assert.equal(tournament.duplicateCount,1); assert.equal(tournament.candidates.length,2);
  const req=buildTeacherEscalation({goal:'judge',melAnswer:'mine',result:{winner:tournament.winner,candidates:tournament.candidates}});
  assert.equal(req.type,'MEL_REQUEST'); assert.match(req.evidence,/providerId/);
});
