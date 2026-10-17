import test from 'node:test';
import assert from 'node:assert/strict';
import { isSubstantialMelTask, findMelWorkReference, buildSubstantialMelNodes, launchSubstantialMelTask } from '../src/work/mel-general-kickoff.js';
import { createWorkDag, WorkDagRunner } from '../src/work/work-dag.js';
import { OpenLoopService } from '../src/conversations/open-loop-service.js';

const GOAL = 'Rédige une étude complète et détaillée sur la comparaison de trois méthodes documentaires. Décompose les preuves, vérifie les limites, conserve les notes en étapes et produis un véritable livrable en plusieurs parties, avec une vérification finale.';

test('large tasks enter durable mode while ordinary chat does not', () => {
  assert.equal(isSubstantialMelTask(GOAL), true);
  assert.equal(isSubstantialMelTask('Bonjour, comment ça va ?'), false);
  assert.equal(isSubstantialMelTask('Pourquoi le serveur dit réponse trop lente ?'), false);
  assert.equal(isSubstantialMelTask('Quel est le statut du long travail demandé hier ?'), false);
  assert.equal(isSubstantialMelTask('Je veux que tu rédiges une étude longue et complète avec plusieurs chapitres, preuves documentées et révisions critiques détaillées.'), true);
});

test('entire 100k-character input is retained in bounded persisted work node payloads', () => {
  const source = 'Rédige une étude complète avec plusieurs parties, études et citations. ' + 'Observation scientifique très détaillée. '.repeat(2200);
  const nodes = buildSubstantialMelNodes(source);
  const parts = nodes.filter(row => row.id.startsWith('ingest-'));
  assert.ok(parts.length > 10);
  assert.ok(nodes.length <= 64);
  assert.ok(nodes.every(row => row.idempotent === true));
  const recovered = parts.map(row => row.payload.input.split('\n').slice(1).join('\n')).join('');
  assert.equal(recovered, source);
  assert.ok(nodes.every(row => row.payload.input.length <= 12000));
});

test('follow-up references exact persistent job from assistant history only for progress requests', () => {
  const id = 'mel-goal-0123456789abcdef0123456789abcdef';
  assert.equal(findMelWorkReference('Où en est ce travail ?', [{ role:'assistant',content:'Référence : ' + id }]), id);
  assert.equal(findMelWorkReference('Bonjour', [{ role:'assistant',content:'Référence : ' + id }]), null);
  assert.equal(findMelWorkReference('Écris une autre histoire', [{ role:'assistant',content:'Référence : ' + id }]), null);
});

test('large goal kickoff stores a real job and schedules a single background node, no external write', async () => {
  const calls = [];
  const scheduled = [];
  let record = null;
  const bus = {execute: async (name, input) => {
    calls.push(name);
    if (name === 'work.status') {
      if (!record) throw new Error('WORK_DAG_NOT_FOUND');
      return {status:'RUNNING',node_counts:{PENDING:record.nodes.length,COMPLETED:0},completed:false,blocked:false};
    }
    if (name === 'work.create') {record = input;return {id: input.id};}
    if (name === 'openloop.capture') return {ok:true};
    if (name === 'work.run') return {status:'RUNNING'};
    throw new Error('UNEXPECTED_' + name);
  }};
  const context = {waitUntil: p => scheduled.push(p)};
  const result = await launchSubstantialMelTask({bus, text:GOAL, conversationId:'test', context});
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.started, true);
  assert.equal(record.nodes[0].kind, 'AUGMENTIO');
  assert.equal(record.conversationId, 'test');
  assert.equal(scheduled.length, 1);
  await Promise.all(scheduled);
  assert.ok(calls.includes('openloop.capture'));
  assert.ok(calls.includes('work.run'));
  assert.ok(!calls.some(item => /submit|claim|pay/.test(item)));
  const same = await launchSubstantialMelTask({bus, text:GOAL, conversationId:'test', context: {}});
  assert.equal(same.created, false);
  assert.equal(same.id, result.id);
  assert.equal(same.started, false);
  assert.equal(scheduled.length, 1, 'repeated HTTP requests must not double-schedule the same work');
  assert.equal(calls.filter(item => item === 'work.run').length, 1);
  assert.equal(calls.filter(item => item === 'work.create').length, 1);
});

test('Work DAG yields at every bounded successful checkpoint and resumes', async () => {
  let stored = createWorkDag({
    id:'example-work',jobId:'example-work',goal:GOAL,nodes:[
      {id:'a',kind:'TASK',idempotent:true,payload:{}},
      {id:'b',kind:'TASK',depends_on:['a'],idempotent:true,payload:{}},
      {id:'c',kind:'TASK',depends_on:['b'],idempotent:true,payload:{}},
    ],
  });
  const sequence = [];
  const store = { load: async () => structuredClone(stored), save: async dag => {stored=structuredClone(dag);return structuredClone(stored);} };
  const runner = new WorkDagRunner({store,executors:{TASK:async node => {sequence.push(node.id);return {artifacts:[{kind:'step',text:node.id}]};}}});
  const first = await runner.run(null,{maxSteps:1});
  assert.equal(first.status,'RUNNING');
  assert.deepEqual(sequence,['a']);
  assert.equal(first.nodes.filter(node=>node.status==='COMPLETED').length,1);
  const second = await runner.run(null,{maxSteps:1});
  assert.deepEqual(sequence,['a','b']);
  assert.equal(second.status,'RUNNING');
  const third = await runner.run(null,{maxSteps:1});
  // The third step has completed but the completion marker is committed on the next tick.
  assert.deepEqual(sequence,['a','b','c']);
  assert.ok(third.nodes.every(node=>node.status==='COMPLETED'));
  const final = await runner.run(null,{maxSteps:1});
  assert.equal(final.status,'COMPLETED');
  assert.deepEqual(sequence,['a','b','c']);
});

test('bare continue resumes only the immediately preceding explicit MEL durable job', () => {
  const latest = 'mel-goal-0123456789abcdef0123456789abcdef';
  const older = 'mel-goal-11111111111111111111111111111111';
  const oldMessage = {role:'assistant',content:'MEL — travail persistant ' + older};
  const active = {role:'assistant',content:'MEL — travail persistant ' + latest + '\nRésultats complets : /api/work/goal?id=' + latest};
  for (const input of ['continue', 'Continue !', 'poursuis', 'reprends']) {
    assert.equal(findMelWorkReference(input,[oldMessage,active]),latest,input);
  }
  assert.equal(findMelWorkReference('continue',[active,{role:'assistant',content:'Autre réponse ordinaire.'}]),null);
  assert.equal(findMelWorkReference('continue',[{role:'user',content:'MEL — travail persistant ' + latest}]),null);
  assert.equal(findMelWorkReference('bonjour',[active]),null);
});


test('durable kickoff gives repeated captures a stable event ID so HTTP retries cannot reset a running lease', async () => {
  let stored = null;
  let writes = 0;
  let now = 1000;
  const captureService = new OpenLoopService({
    get: async () => stored,
    upsert: async row => { stored = row; writes += 1; return row; },
  }, { now: () => now });
  const captures = [];
  let created = false;
  const bus = { execute: async (name, input) => {
    if (name === 'work.status') {
      if (!created) throw Error('WORK_DAG_NOT_FOUND');
      return { status: 'RUNNING', completed: false, blocked: false, node_counts: { PENDING: 4 } };
    }
    if (name === 'work.create') { created = true; return { id: input.id }; }
    if (name === 'openloop.capture') {
      captures.push(input);
      return captureService.capture({ ...input, owner: 'owner' });
    }
    if (name === 'work.run') return { status: 'RUNNING' };
    throw Error('UNEXPECTED_' + name);
  }};
  const first = await launchSubstantialMelTask({ bus, text: GOAL, conversationId: 'owner-conversation', context: {} });
  assert.equal(first.ok, true);
  assert.equal(writes, 1);
  assert.equal(captures[0].sourceEventId, first.id);
  const firstDue = stored.resumeAt;
  stored = { ...stored, status: 'resuming', leaseToken: 'active-runner', leaseUntil: 99999 };
  now += 500;
  const repeated = await launchSubstantialMelTask({ bus, text: GOAL, conversationId: 'owner-conversation', context: {} });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.created, false);
  assert.equal(captures[1].sourceEventId, first.id);
  assert.equal(writes, 1, 'retry must not rewrite open-loop due time or lease');
  assert.equal(stored.leaseToken, 'active-runner');
  assert.equal(stored.resumeAt, firstDue);
});


test('a failed or unverifiable work.status never creates or overwrites a durable job', async () => {
  for (const problem of [
    Object.assign(new Error('D1 unavailable'), { code: 'D1_UNAVAILABLE' }),
    Object.assign(new Error('capability forbidden'), { code: 'CAPABILITY_FORBIDDEN' }),
    Object.assign(new Error('WORK_DAG_STORE_CORRUPT'), { code: 'WORK_DAG_STORE_CORRUPT' }),
  ]) {
    const calls = [];
    const bus = { execute: async name => {
      calls.push(name);
      if (name === 'work.status') throw problem;
      throw new Error('SHOULD_NOT_BE_CALLED_' + name);
    }};
    const result = await launchSubstantialMelTask({ bus, text: GOAL, conversationId: 'failure', context: {} });
    assert.equal(result.ok, false);
    assert.equal(result.code, problem.code);
    assert.deepEqual(calls, ['work.status']);
  }
  const calls = [];
  const bus = { execute: async name => {
    calls.push(name);
    if (name === 'work.status') return null;
    throw Error('SHOULD_NOT_CREATE');
  }};
  const result = await launchSubstantialMelTask({ bus, text: GOAL, conversationId: 'invalid-state', context: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WORK_DAG_STATUS_INVALID');
  assert.deepEqual(calls, ['work.status']);
});

test('only explicit WORK_DAG_NOT_FOUND permits creating a new durable job', async () => {
  let createCount = 0;
  let status = null;
  const bus = { execute: async (name,input) => {
    if (name === 'work.status') {
      if (!status) throw Object.assign(new Error('not found'), { code: 'WORK_DAG_NOT_FOUND' });
      return status;
    }
    if (name === 'work.create') {
      createCount++;
      status = { status:'RUNNING', completed:false, blocked:false, node_counts:{PENDING:1} };
      return { id: input.id };
    }
    if (name === 'openloop.capture') return { ok:true };
    throw Error('UNEXPECTED_' + name);
  }};
  const first = await launchSubstantialMelTask({ bus,text:GOAL,conversationId:'new-dag',context:{} });
  assert.equal(first.ok,true);
  assert.equal(first.created,true);
  const repeated = await launchSubstantialMelTask({ bus,text:GOAL,conversationId:'new-dag',context:{} });
  assert.equal(repeated.ok,true);
  assert.equal(repeated.created,false);
  assert.equal(createCount,1);
});
