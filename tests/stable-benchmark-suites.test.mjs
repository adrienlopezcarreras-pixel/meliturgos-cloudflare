import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import {
  REQUIRED_STABLE_BENCHMARK_KINDS,
  STABLE_BENCHMARK_SUITES_V1,
  validateStableBenchmarkRegistry,
  stableBenchmarkCatalog,
  runStableBenchmarkSuite,
  runStableBenchmarkPack,
  scoreStableBenchmarkObservations,
  compareStableBenchmarkRuns,
  compareStableBenchmarkPacks,
} from '../src/evaluation/stable-benchmark-suites.js';

test('MEL-EVAL-01 stable registry covers conversation code research and memory with unique cases',()=>{
  const validation=validateStableBenchmarkRegistry();
  assert.equal(validation.suite_count,4);
  assert.equal(validation.case_count,16);
  assert.deepEqual(new Set(validation.suites.map(row=>row.kind)),new Set(REQUIRED_STABLE_BENCHMARK_KINDS));
  assert.match(validation.registry_digest,/^fnv1a-[0-9a-f]{8}$/);

  const ids=stableBenchmarkCatalog().suites.flatMap(suite=>suite.cases.map(row=>row.id));
  assert.equal(new Set(ids).size,ids.length);
  const catalog=stableBenchmarkCatalog();
  const linked=catalog.suites.flatMap(suite=>suite.cases).filter(row=>row.learning_case_id);
  assert.ok(linked.length>=6);
  assert.equal(catalog.suites.find(suite=>suite.kind==='research').canonical_learning_links,0);
});

test('MEL-EVAL-01 registry digest is deterministic across cloned definitions',()=>{
  const first=validateStableBenchmarkRegistry(STABLE_BENCHMARK_SUITES_V1);
  const clone=structuredClone(STABLE_BENCHMARK_SUITES_V1);
  const second=validateStableBenchmarkRegistry(clone);
  assert.equal(first.registry_digest,second.registry_digest);
  assert.deepEqual(first.suites,second.suites);
});

test('MEL-EVAL-01 suite runner preserves all failed cases as score zero instead of hiding them',async()=>{
  let calls=0;
  const run=await runStableBenchmarkSuite({
    suiteId:'mel-eval-research-v1',
    evaluator:async testCase=>{
      calls+=1;
      if(testCase.id==='research-conflict-01') throw Object.assign(new Error('provider down'),{code:'PROVIDER_FAILED'});
      return {score:1,evidence:{observed:true}};
    },
  });
  assert.equal(calls,4);
  assert.equal(run.cases,4);
  assert.equal(run.failures.length,1);
  assert.equal(run.failures[0].id,'research-conflict-01');
  assert.equal(run.results.find(row=>row.id==='research-conflict-01').score,0);
  assert.ok(run.overall>0 && run.overall<1);
});

test('MEL-EVAL-01 pack runner produces one comparable result for every stable suite',async()=>{
  const pack=await runStableBenchmarkPack({
    evaluator:async()=>({score:1,evidence:{fixture:true}}),
    context:{source:'test'},
  });
  assert.equal(pack.suite_count,4);
  assert.equal(pack.case_count,16);
  assert.equal(pack.failed_cases,0);
  assert.equal(pack.overall,1);
  assert.deepEqual(pack.suites.map(run=>run.suite_kind).sort(),[...REQUIRED_STABLE_BENCHMARK_KINDS].sort());
  assert.equal(new Set(pack.suites.map(run=>run.registry_digest)).size,1);
});

test('MEL-EVAL-01 registry fails closed on missing required benchmark kind',()=>{
  const incomplete=structuredClone(STABLE_BENCHMARK_SUITES_V1).filter(suite=>suite.kind!=='memory');
  assert.throws(
    ()=>validateStableBenchmarkRegistry(incomplete),
    error=>error.code==='STABLE_BENCHMARK_KINDS_MISSING' && error.missing.includes('memory')
  );
});

test('MEL-EVAL-01 runner fails closed on unknown suite',async()=>{
  await assert.rejects(
    ()=>runStableBenchmarkSuite({suiteId:'unknown',evaluator:async()=>1}),
    error=>error.code==='STABLE_BENCHMARK_SUITE_NOT_FOUND'
  );
});


test('MEL-EVAL-01 rejects a stable case linked to a nonexistent canonical learning case',()=>{
  const broken=structuredClone(STABLE_BENCHMARK_SUITES_V1);
  broken[0].cases[0].learning_case_id='learning-case-does-not-exist';
  assert.throws(
    ()=>validateStableBenchmarkRegistry(broken),
    error=>error.code==='STABLE_BENCHMARK_LEARNING_CASE_UNKNOWN'
  );
});


test('MEL-EVAL-01 registry digest changes when canonical learning crosswalk changes',()=>{
  const original=validateStableBenchmarkRegistry(STABLE_BENCHMARK_SUITES_V1);
  const changed=structuredClone(STABLE_BENCHMARK_SUITES_V1);
  changed[0].cases[0].learning_case_id='code-development-01';
  const modified=validateStableBenchmarkRegistry(changed);
  assert.notEqual(modified.registry_digest,original.registry_digest);
});


test('MEL-EVAL-01 measured observation scorer keeps missing cases visible as zero',()=>{
  const run=scoreStableBenchmarkObservations({
    suiteId:'mel-eval-memory-v1',
    observations:[
      {id:'memory-eval-provenance-01',score:1},
      {id:'memory-eval-contradiction-01',score:0.8},
    ],
  });
  assert.equal(run.cases,4);
  assert.equal(run.failures.length,2);
  assert.equal(run.results.find(row=>row.id==='memory-eval-temporal-01').score,0);
  assert.equal(run.results.find(row=>row.id==='memory-eval-temporal-01').error,'MISSING_OBSERVATION');
  assert.ok(run.overall<1);
});

test('MEL-EVAL-01 measured observation scorer rejects unknown or duplicate case ids',()=>{
  assert.throws(
    ()=>scoreStableBenchmarkObservations({
      suiteId:'mel-eval-code-v1',
      observations:[{id:'unknown',score:1}],
    }),
    error=>error.code==='STABLE_BENCHMARK_OBSERVATION_UNKNOWN'
  );
  assert.throws(
    ()=>scoreStableBenchmarkObservations({
      suiteId:'mel-eval-code-v1',
      observations:[
        {id:'code-minimal-change-01',score:1},
        {id:'code-minimal-change-01',score:0.5},
      ],
    }),
    error=>error.code==='STABLE_BENCHMARK_OBSERVATION_DUPLICATE'
  );
});


test('MEL-EVAL-01 stable benchmark catalog and scoring are available through CapabilityBus',async()=>{
  const bus=createDefaultCapabilityBus({env:{}});
  assert.equal(bus.describe('evaluation.benchmark.catalog').health,'HEALTHY');
  assert.equal(bus.describe('evaluation.benchmark.score').risk,'LOW');

  const catalog=await bus.execute('evaluation.benchmark.catalog',{},{
    owner:'test',permissions:[],requestId:'eval-catalog'
  });
  assert.equal(catalog.suite_count,4);

  const scored=await bus.execute('evaluation.benchmark.score',{
    suiteId:'mel-eval-conversation-v1',
    observations:[
      {id:'conversation-instruction-01',score:1},
      {id:'conversation-context-01',score:1},
      {id:'conversation-uncertainty-01',score:1},
      {id:'conversation-no-fabrication-01',score:1},
    ],
  },{owner:'test',permissions:[],requestId:'eval-score'});
  assert.equal(scored.overall,1);
  assert.equal(scored.failures.length,0);
});


test('MEL-EVAL-01 comparable runs expose score deltas only under identical benchmark identity',()=>{
  const baseline=scoreStableBenchmarkObservations({
    suiteId:'mel-eval-conversation-v1',
    observations:[
      {id:'conversation-instruction-01',score:0.5},
      {id:'conversation-context-01',score:0.5},
      {id:'conversation-uncertainty-01',score:0.5},
      {id:'conversation-no-fabrication-01',score:0.5},
    ],
  });
  const candidate=scoreStableBenchmarkObservations({
    suiteId:'mel-eval-conversation-v1',
    observations:[
      {id:'conversation-instruction-01',score:1},
      {id:'conversation-context-01',score:1},
      {id:'conversation-uncertainty-01',score:1},
      {id:'conversation-no-fabrication-01',score:1},
    ],
  });
  const result=compareStableBenchmarkRuns(baseline,candidate);
  assert.equal(result.comparable,true);
  assert.ok(result.comparison.delta>0);

  const changed={...candidate,suite_digest:'different'};
  const blocked=compareStableBenchmarkRuns(baseline,changed);
  assert.equal(blocked.comparable,false);
  assert.equal(blocked.comparison,null);
  assert.ok(blocked.blockers.some(row=>row.field==='suite_digest'));
});

test('MEL-EVAL-01 pack comparison fails closed when registry identity changes',async()=>{
  const baseline=await runStableBenchmarkPack({evaluator:async()=>({score:0.6})});
  const candidate=await runStableBenchmarkPack({evaluator:async()=>({score:0.8})});
  const good=compareStableBenchmarkPacks(baseline,candidate);
  assert.equal(good.comparable,true);
  assert.ok(good.delta>0);

  const bad=compareStableBenchmarkPacks(baseline,{...candidate,registry_digest:'other'});
  assert.equal(bad.comparable,false);
  assert.equal(bad.delta,null);
  assert.ok(bad.blockers.some(row=>row.code==='STABLE_BENCHMARK_REGISTRY_DIGEST_MISMATCH'));
});
