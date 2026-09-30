import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInMemoryStableEvalWatchStore,
  runStableEvalWatch,
  STABLE_EVAL_WATCH_SCHEMA,
} from '../../src/evaluation/stable-eval-watch.js';

const SHA_A='a'.repeat(40);
const SHA_B='b'.repeat(40);
const SHA_C='c'.repeat(40);

function evaluators(scores={}) {
  return {
    conversation: async testCase => ({score:scores[testCase.id] ?? 0.95,evidence:{case_id:testCase.id}}),
    code: async testCase => ({score:scores[testCase.id] ?? 0.95,evidence:{case_id:testCase.id}}),
    search: async testCase => ({score:scores[testCase.id] ?? 0.95,evidence:{case_id:testCase.id}}),
    memory: async testCase => ({score:scores[testCase.id] ?? 0.95,evidence:{case_id:testCase.id}}),
  };
}

test('MEL-EVAL-01 establishes a durable exact-SHA baseline on first complete run',async()=>{
  const store=createInMemoryStableEvalWatchStore();
  const result=await runStableEvalWatch({store,evaluators:evaluators(),source_sha:SHA_A});
  assert.equal(result.status,'BASELINE_ESTABLISHED');
  assert.equal(result.promoted,true);
  assert.equal(result.baseline_source_sha,SHA_A);
  assert.equal(result.state.schema,STABLE_EVAL_WATCH_SCHEMA);
  assert.equal(result.state.revision,1);
  assert.equal(result.state.baseline.source_sha,SHA_A);

  const persisted=await store.load();
  assert.equal(persisted.baseline.source_sha,SHA_A);
  assert.equal(persisted.baseline.complete,true);
});

test('MEL-EVAL-01 promotes a non-regressing candidate and replaces baseline',async()=>{
  const store=createInMemoryStableEvalWatchStore();
  await runStableEvalWatch({store,evaluators:evaluators(),source_sha:SHA_A});
  const result=await runStableEvalWatch({
    store,
    evaluators:evaluators({'search-source-quality':0.96}),
    source_sha:SHA_B,
  });
  assert.equal(result.status,'PROMOTED');
  assert.equal(result.promoted,true);
  assert.equal(result.baseline_source_sha,SHA_B);
  assert.equal(result.state.revision,2);
});

test('MEL-EVAL-01 blocks regression and preserves previous baseline',async()=>{
  const store=createInMemoryStableEvalWatchStore();
  await runStableEvalWatch({store,evaluators:evaluators(),source_sha:SHA_A});
  const result=await runStableEvalWatch({
    store,
    evaluators:evaluators({
      'memory-provenance':0.2,
      'memory-contradiction':0.2,
    }),
    source_sha:SHA_C,
  });
  assert.equal(result.status,'REGRESSION_BLOCKED');
  assert.equal(result.promoted,false);
  assert.equal(result.baseline_source_sha,SHA_A);
  assert.equal(result.state.baseline.source_sha,SHA_A);
  assert.equal(result.state.last_candidate.source_sha,SHA_C);
  assert.ok(result.comparison.reasons.some(reason=>reason.startsWith('memory:')));
});

test('MEL-EVAL-01 missing domain evaluator cannot silently replace baseline',async()=>{
  const store=createInMemoryStableEvalWatchStore();
  await runStableEvalWatch({store,evaluators:evaluators(),source_sha:SHA_A});
  const result=await runStableEvalWatch({
    store,
    evaluators:{
      conversation:evaluators().conversation,
      code:evaluators().code,
      search:evaluators().search,
    },
    source_sha:SHA_B,
  });
  assert.equal(result.promoted,false);
  assert.equal(result.baseline_source_sha,SHA_A);
  assert.ok(result.comparison.reasons.includes('memory:DOMAIN_BELOW_FLOOR'));
});

test('MEL-EVAL-01 rejects non-exact SHA provenance before evaluation',async()=>{
  let called=0;
  const ev=evaluators();
  const wrapped=Object.fromEntries(Object.entries(ev).map(([key,fn])=>[key,async tc=>{called+=1;return fn(tc);}]));
  await assert.rejects(
    ()=>runStableEvalWatch({
      store:createInMemoryStableEvalWatchStore(),
      evaluators:wrapped,
      source_sha:'abc123',
    }),
    error=>error?.code==='STABLE_EVAL_SOURCE_SHA_INVALID',
  );
  assert.equal(called,0);
});

test('MEL-EVAL-01 requires a durable store and fails closed',async()=>{
  await assert.rejects(
    ()=>runStableEvalWatch({evaluators:evaluators(),source_sha:SHA_A}),
    error=>error?.code==='STABLE_EVAL_WATCH_STORE_REQUIRED',
  );
});
