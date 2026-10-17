import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isMelWorkKickoff, performMelWorkPractice, computeMelWorkChunk, registerMelWorkKickoffCapabilities, startMelWorkKickoff } from '../src/work/mel-work-kickoff.js';

const PROMPT = '# MEL WORK — DÉMARRER IMMÉDIATEMENT MA PRÉPARATION AU TRAVAIL RÉMUNÉRÉ MEL, à partir de maintenant, tu dois commencer concrètement à te préparer à exercer ton activité d’agente de travail numérique.';

test('kickoff recognizes explicit owner mission but not unrelated chat', () => {
  assert.equal(isMelWorkKickoff(PROMPT), true);
  for (const other of ['Bonjour', 'Que fait MEL WORK ?', 'Vérifie le statut du serveur', 'MEL WORK doit répondre à mon grand prompt', 'MEL WORK — DÉMARRER IMMÉDIATEMENT MA PRÉPARATION AU TRAVAIL RÉMUNÉRÉ']) {
    assert.equal(isMelWorkKickoff(other), false, other);
  }
});

test('first MEL WORK training exercises actually produce validated samples', () => {
  for (const kind of ['writing', 'data', 'code']) {
    const report = performMelWorkPractice(kind);
    assert.equal(report.kind, 'training_sample');
    assert.ok(Object.values(report.quality_checks).every(Boolean));
  }
  assert.equal(performMelWorkPractice('data').clean_rows.length, 2);
  assert.throws(() => performMelWorkPractice('payments'), /MEL_WORK_PRACTICE_KIND_UNKNOWN/);
});

test('complex exact calculation is chunked and cross-checked without floating point loss', () => {
  const part = computeMelWorkChunk({ start: 40001, count: 20000 });
  assert.equal(part.quality_checks.closed_form_match, true);
  assert.ok(BigInt(part.sum_of_squares) > 0n);
  assert.throws(() => computeMelWorkChunk({ start: 1, count: 100000000 }), /MEL_WORK_COMPUTE_RANGE_INVALID/);
});

test('kickoff resumes an existing durable plan instead of duplicating it', async () => {
  const calls = [];
  const saved = new Map();
  const records = new Map();
  const handlers = new Map();
  registerMelWorkKickoffCapabilities({ discover: (manifest, handler) => handlers.set(manifest.id, handler) }, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ tasks: [{id: 'public-task', status: 'open', expiryTime: '2099-01-01T00:00:00Z', description: 'Read a document'}] }),
    }),
  });
  const bus = { execute: async (id, input) => {
    calls.push({ id, input });
    if (handlers.has(id)) return handlers.get(id)(input);
    if (id === 'work.plan.save') {
      if (saved.has(input.id)) throw new Error('WORK_PLAN_ALREADY_EXISTS');
      saved.set(input.id, input);
      return {id: input.id};
    }
    if (id === 'work.plan.get') return saved.get(input.id) || null;
    if (id === 'work.plan.materialize') return { plan: { work_dag_id: 'work-' + input.id }, work: { id: 'work-' + input.id } };
    if (id === 'work.run') {
      for (const capability of ['melwork.practice', 'melwork.practice', 'melwork.practice', 'melwork.compute.chunk', 'melwork.compute.chunk', 'melwork.compute.chunk', 'melwork.market.scan']) {
        const input = capability === 'melwork.practice'
          ? {kind: ['writing','data','code'][records.size] || 'code'}
          : capability === 'melwork.compute.chunk'
            ? {start: (records.size - 3) * 20000 + 1, count: 20000} : {};
        const result = await handlers.get(capability)(input);
        for (const artifact of result.artifacts) records.set(capability + '-' + records.size, artifact);
      }
      return {status: 'COMPLETED'};
    }
    if (id === 'work.plan.sync') return { ok: true, work: {status: 'COMPLETED'} };
    if (id === 'work.artifacts') return { artifacts: [...records.values()].map(artifact => ({artifact})) };
    throw new Error('UNKNOWN_CAPABILITY_' + id);
  }};
  const params = { bus, text: PROMPT, conversationId: 'owner-thread', context: {} };
  const first = await startMelWorkKickoff(params);
  const second = await startMelWorkKickoff(params);
  assert.equal(first.ok, true);
  assert.equal(first.status, 'COMPLETED');
  assert.equal(first.training_exercises_verified, 3);
  assert.equal(first.calculation_chunks_verified, 3);
  assert.equal(first.taskmarket_status, 'OBSERVED');
  assert.equal(second.ok, true);
  assert.equal(first.plan_id, second.plan_id);
  assert.equal(saved.size, 1);
  assert.equal(calls.filter(item => item.id === 'work.plan.save').length, 2);
  assert.ok(calls.some(item => item.id === 'work.run'));
  assert.ok(calls.every(item => !/submit|claim|pay|bid/i.test(item.id)));
});

test('explicit MEL WORK chat runs kickoff before model inference', async () => {
  const text = await readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  assert.match(text, /if \(!releaseSmoke && !body\.capability\?\.id && inputSource === 'text' && isMelWorkKickoff\(text\)\)/);
  assert.ok(text.indexOf('startMelWorkKickoff({') < text.indexOf('const [activeInferenceSettings, activeAdapter]'));
});


test('kickoff reports durable synchronized state if run response disagrees', async () => {
  const bus = { execute: async (id, input) => {
    if (id === 'work.plan.save') return { id: input.id };
    if (id === 'work.plan.get') return {plan:{id:input.id}};
    if (id === 'work.plan.materialize') return { plan: { work_dag_id: 'durable-work' } };
    if (id === 'work.run') return { status: 'COMPLETED' };
    if (id === 'work.plan.sync') return { work: { status: 'RUNNING' } };
    if (id === 'work.artifacts') return { artifacts: [] };
    throw new Error('UNEXPECTED_' + id);
  }};
  const result = await startMelWorkKickoff({ bus, text: PROMPT, conversationId: 'durable-truth', context: {} });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'RUNNING');
  assert.equal(result.persisted, true);
});


test('kickoff does not invent a Work DAG identifier when materialization returns none', async () => {
  const calls = [];
  const bus = { execute: async (id, input) => {
    calls.push(id);
    if (id === 'work.plan.save') return {id: input.id};
    if (id === 'work.plan.get') return {plan:{id:input.id}};
    if (id === 'work.plan.materialize') return {plan: {}};
    throw new Error('UNEXPECTED_' + id);
  }};
  const result = await startMelWorkKickoff({bus,text:PROMPT,conversationId:'missing-dag',context:{}});
  assert.equal(result.ok,false);
  assert.equal(result.persisted,true);
  assert.equal(result.error_code,'MEL_WORK_DAG_ID_MISSING');
  assert.equal(calls.includes('work.run'),false);
});


test('kickoff reuses an already persisted DAG instead of rematerializing', async () => {
  const calls = [];
  const bus = { execute: async (id, input) => {
    calls.push(id);
    if (id === 'work.plan.save') throw new Error('WORK_PLAN_ALREADY_EXISTS');
    if (id === 'work.plan.get') return { plan: {id: input.id, work_dag_id: 'persisted-dag'} };
    if (id === 'work.plan.materialize') throw new Error('SHOULD_NOT_REMATERIALIZE');
    if (id === 'work.run') return {status:'COMPLETED'};
    if (id === 'work.plan.sync') return {work:{status:'COMPLETED'}};
    if (id === 'work.artifacts') return {artifacts:[]};
    throw new Error('UNKNOWN_' + id);
  }};
  const output = await startMelWorkKickoff({bus,text:PROMPT,conversationId:'resume-dag',context:{}});
  assert.equal(output.ok,true);
  assert.equal(output.work_dag_id,'persisted-dag');
  assert.equal(calls.includes('work.plan.materialize'),false);
});


test('kickoff evidence requires distinct verified exercise kinds and calculation segments', async () => {
  const source = await readFile(new URL('../src/work/mel-work-kickoff.js', import.meta.url), 'utf8');
  assert.match(source, /const verifiedTrainingKinds = new Set/);
  assert.match(source, /Object\.values\(row\.artifact\.quality_checks\)\.every\(Boolean\)/);
  assert.match(source, /const verifiedChunks = new Set/);
  assert.match(source, /\[1,20001,40001\]\.includes\(row\.artifact\.start\)/);
});


test('kickoff does not report success when persisted execution failed', async () => {
  const bus={execute:async (id,input)=>{
    if(id==='work.plan.save') return {id:input.id};
    if(id==='work.plan.get') return {plan:{id:input.id}};
    if(id==='work.plan.materialize') return {plan:{work_dag_id:'failed-dag'}};
    if(id==='work.run') return {status:'COMPLETED'};
    if(id==='work.plan.sync') return {work:{status:'FAILED'}};
    if(id==='work.artifacts') return {artifacts:[]};
    throw new Error('UNKNOWN_'+id);
  }};
  const result=await startMelWorkKickoff({bus,text:PROMPT,conversationId:'failed-state',context:{}});
  assert.equal(result.status,'FAILED');
  assert.equal(result.ok,false);
  assert.equal(result.persisted,true);
});


test('kickoff returns non-success for an incomplete persisted Work run', async () => {
  const bus={execute:async(id,input)=>{
    if(id==='work.plan.save')return {id:input.id};
    if(id==='work.plan.get')return {plan:{id:input.id}};
    if(id==='work.plan.materialize')return {plan:{work_dag_id:'running-dag'}};
    if(id==='work.run')return {status:'RUNNING'};
    if(id==='work.plan.sync')return {work:{status:'RUNNING'}};
    if(id==='work.artifacts')return {artifacts:[]};
    throw new Error('UNEXPECTED_'+id);
  }};
  const result=await startMelWorkKickoff({bus,text:PROMPT,conversationId:'running-state',context:{}});
  assert.equal(result.status,'RUNNING');
  assert.equal(result.ok,false);
  assert.equal(result.persisted,true);
});
