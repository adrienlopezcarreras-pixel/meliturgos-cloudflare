import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isMelWorkKickoff, performMelWorkPractice, computeMelWorkChunk, registerMelWorkKickoffCapabilities, startMelWorkKickoff } from '../src/work/mel-work-kickoff.js';

const PROMPT = '# MEL WORK — DÉMARRER IMMÉDIATEMENT MA PRÉPARATION AU TRAVAIL RÉMUNÉRÉ MEL, à partir de maintenant, tu dois commencer concrètement à te préparer à exercer ton activité d’agente de travail numérique.';

function mockWork({ terminal = false, chunks = [], failStatus = false, missingId = false } = {}) {
  const calls = [];
  const plans = new Map();
  const deferred = [];
  let resolveRun;
  const workRun = new Promise(resolve => { resolveRun = resolve; });
  const bus = { execute: async (name, input) => {
    calls.push({name,input});
    if (name === 'work.plan.save') {
      if (plans.has(input.id)) throw Object.assign(new Error('WORK_PLAN_ALREADY_EXISTS'), {code:'WORK_PLAN_ALREADY_EXISTS'});
      plans.set(input.id, {id:input.id});
      return { id: input.id };
    }
    if (name === 'work.plan.get') {
      const plan = plans.get(input.id);
      if (!plan) throw new Error('WORK_PLAN_NOT_FOUND');
      return {plan};
    }
    if (name === 'work.plan.materialize') {
      if (missingId) return {plan:{}};
      const plan = plans.get(input.id);
      plan.work_dag_id = 'work-' + input.id;
      return {plan,work:{id:plan.work_dag_id}};
    }
    if (name === 'work.status') {
      if (failStatus) throw new Error('DB_UNAVAILABLE');
      return {status: terminal ? 'COMPLETED' : 'RUNNING',
        node_counts: terminal ? {COMPLETED:7} : {COMPLETED:0,PENDING:7}, completed:terminal};
    }
    if (name === 'work.artifacts') return {artifacts:chunks};
    if (name === 'work.run') return workRun;
    throw new Error('UNEXPECTED_' + name);
  }};
  const context = { waitUntil: p => deferred.push(p) };
  return {bus, context, calls, plans, deferred, resolveRun};
}

test('only the explicit MEL WORK owner kickoff starts jobs', () => {
  assert.equal(isMelWorkKickoff(PROMPT), true);
  for (const other of ['Bonjour', 'Que fait MEL WORK ?', 'Vérifie le statut du serveur',
    'MEL WORK doit répondre à mon grand prompt',
    'MEL WORK — DÉMARRER IMMÉDIATEMENT MA PRÉPARATION AU TRAVAIL RÉMUNÉRÉ']) {
    assert.equal(isMelWorkKickoff(other), false, other);
  }
});

test('real training and exact arithmetic execute as independently verified chunks', () => {
  for (const kind of ['writing','data','code']) {
    const report = performMelWorkPractice(kind);
    assert.equal(report.kind,'training_sample');
    assert.ok(Object.values(report.quality_checks).every(Boolean));
  }
  assert.equal(performMelWorkPractice('data').clean_rows.length, 2);
  assert.throws(() => performMelWorkPractice('payments'), /MEL_WORK_PRACTICE_KIND_UNKNOWN/);
  const result = computeMelWorkChunk({start:40001,count:20000});
  assert.equal(result.quality_checks.closed_form_match, true);
  assert.ok(BigInt(result.sum_of_squares) > 0n);
});

test('large owner kickoff immediately returns an honest durable receipt while first Work run is unfinished', async () => {
  const m = mockWork();
  const result = await startMelWorkKickoff({bus:m.bus,text:PROMPT,conversationId:'first',context:m.context});
  assert.equal(result.ok,true);
  assert.equal(result.persisted,true);
  assert.equal(result.completed,false);
  assert.equal(result.status,'RUNNING');
  assert.equal(result.training_exercises_verified,0);
  assert.equal(result.calculation_chunks_verified,0);
  assert.equal(result.verified_steps,0);
  assert.equal(result.execution_scheduled,true);
  assert.equal(m.deferred.length,1);
  assert.deepEqual(m.calls.filter(x=>x.name==='work.run').map(x=>x.input),[{id:result.work_dag_id,maxSteps:1}]);
  assert.equal(m.calls.some(x=>x.name==='work.plan.sync'),false);
  assert.equal(m.calls.some(x=>x.name==='work.artifacts'),false);
  m.resolveRun({status:'RUNNING'});
  await Promise.all(m.deferred);
});

test('HTTP retry reuses the saved job and does not schedule duplicate execution', async () => {
  const m = mockWork();
  const params = {bus:m.bus,text:PROMPT,conversationId:'retry',context:m.context};
  const first = await startMelWorkKickoff(params);
  const second = await startMelWorkKickoff(params);
  assert.equal(first.ok,true);
  assert.equal(second.ok,true);
  assert.equal(first.plan_id,second.plan_id);
  assert.equal(second.created,false);
  assert.equal(second.execution_scheduled,false);
  assert.equal(m.plans.size,1);
  assert.equal(m.deferred.length,1);
  assert.equal(m.calls.filter(x=>x.name==='work.plan.materialize').length,1);
  assert.equal(m.calls.filter(x=>x.name==='work.run').length,1);
  m.resolveRun({});
  await Promise.all(m.deferred);
});

test('no background wake is invented without waitUntil; durable materialization still persists', async () => {
  const m = mockWork();
  const out = await startMelWorkKickoff({bus:m.bus,text:PROMPT,conversationId:'cron',context:{}});
  assert.equal(out.ok,true);
  assert.equal(out.persisted,true);
  assert.equal(out.execution_scheduled,false);
  assert.equal(m.calls.filter(x=>x.name==='work.run').length,0);
  assert.equal(m.calls.filter(x=>x.name==='work.plan.materialize').length,1);
});

test('completed jobs report only distinct proven exercise and calculation artifacts', async () => {
  const m = mockWork({terminal:true,chunks:[
    {artifact:{kind:'training_sample',category:'professional_writing',quality_checks:{capitalized_opening:true}}},
    {artifact:{kind:'training_sample',category:'professional_writing',quality_checks:{capitalized_opening:true}}},
    {artifact:{kind:'computation_sample',start:1,count:20000,quality_checks:{closed_form_match:true}}},
    {artifact:{kind:'computation_sample',start:1,count:20000,quality_checks:{closed_form_match:true}}},
  ]});
  const out = await startMelWorkKickoff({bus:m.bus,text:PROMPT,conversationId:'done',context:m.context});
  assert.equal(out.ok,true);
  assert.equal(out.completed,true);
  assert.equal(out.verified_steps,7);
  assert.equal(out.training_exercises_verified,1);
  assert.equal(out.calculation_chunks_verified,1);
  assert.equal(out.execution_scheduled,false);
  assert.equal(m.deferred.length,0);
});

test('missing DAG link and D1 status failures are explicit failures, not false acknowledgments', async () => {
  const missing=mockWork({missingId:true});
  const a=await startMelWorkKickoff({bus:missing.bus,text:PROMPT,conversationId:'bad-link',context:missing.context});
  assert.equal(a.ok,false);
  assert.equal(a.persisted,true);
  assert.equal(a.error_code,'MEL_WORK_DAG_ID_MISSING');
  const broken=mockWork({failStatus:true});
  const b=await startMelWorkKickoff({bus:broken.bus,text:PROMPT,conversationId:'bad-db',context:broken.context});
  assert.equal(b.ok,false);
  assert.equal(b.persisted,true);
  assert.equal(b.error_code,'DB_UNAVAILABLE');
});

test('chat invokes the durable kickoff before any model inference', async () => {
  const source=await readFile(new URL('../src/api/native-chat.js',import.meta.url),'utf8');
  assert.match(source,/if \(!releaseSmoke && !body\.capability\?\.id && inputSource === 'text' && isMelWorkKickoff\(text\)\)/);
  assert.match(source,/status: kickoff\.ok \? \(kickoff\.completed \? 200 : 202\) : 503/);
  assert.ok(source.indexOf('startMelWorkKickoff({') < source.indexOf('const [activeInferenceSettings, activeAdapter]'));
});
