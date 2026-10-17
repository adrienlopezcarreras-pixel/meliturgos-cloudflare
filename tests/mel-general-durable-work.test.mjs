import test from 'node:test';
import assert from 'node:assert/strict';
import { isSubstantialMelTask, findMelWorkReference, buildSubstantialMelNodes, launchSubstantialMelTask } from '../src/work/mel-general-kickoff.js';
import { createWorkDag, WorkDagRunner } from '../src/work/work-dag.js';

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
