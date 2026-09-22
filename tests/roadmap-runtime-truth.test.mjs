import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';

function byId(id) {
  return flattenRoadmap().find((row) => row.id === id);
}

test('roadmap certifies repeated supervised autonomy only with exact candidate proof while preserving Work and gap evidence', () => {
  const autonomy = byId('GEN2-17');
  assert.ok(autonomy, 'missing roadmap item GEN2-17');
  assert.equal(autonomy.status, 'DONE_VERIFIED');
  assert.match(autonomy.next, /35710587356/);
  assert.match(autonomy.next, /91831831c5581f2c7b5d657228d6e9a8a4ab31e6/);
  assert.match(autonomy.next, /3 jobs|A→B→C|stale/i);
  assert.match(autonomy.next, /aucune mutation production/i);

  const work = byId('MEL-WORK-02');
  assert.ok(work, 'missing roadmap item MEL-WORK-02');
  assert.equal(work.status, 'DONE_VERIFIED');
  assert.match(work.next, /50 tâches|50 gates|heartbeats|sans duplication/i);

  const gapDetection = byId('MEL-EVOL-01');
  assert.ok(gapDetection, 'missing roadmap item MEL-EVOL-01');
  assert.equal(gapDetection.status, 'DONE_VERIFIED');
  assert.match(gapDetection.next, /d[ée]tection|gap|doublon|module/i);
});

test('audit log remains verified only with correlated denial and terminal evidence', () => {
  const row = byId('GEN2-45');
  assert.ok(row, 'missing roadmap item GEN2-45');
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.next, /35712785367/);
  assert.match(row.next, /710718a22647235d474fe7780ae7dd0d121d7a72/);
  assert.match(row.next, /requestId|DENIED|SUCCEEDED|FAILED/i);
  assert.match(row.next, /D1|sans entrée brute/i);
});

test('web research remains partial until production validation while naming the remaining proof', () => {
  const row = byId('GEN2-37');
  assert.equal(row.status, 'PARTIAL');
  assert.match(row.next, /production/i);
  assert.match(row.next, /sources/i);
});

test('code access and release smokes stay verified only with explicit live production evidence', () => {
  const read = byId('MEL-CODE-01');
  const search = byId('MEL-CODE-02');
  const release = byId('MEL-REL-03');

  assert.equal(read.status, 'DONE_VERIFIED');
  assert.equal(search.status, 'DONE_VERIFIED');
  assert.equal(release.status, 'DONE_VERIFIED');

  for (const row of [read, search, release]) {
    assert.match(row.next, /35693911802/);
    assert.match(row.next, /f5f294b1b4167fdbc88926d590f1dd808b73133e/);
  }
  assert.match(read.next, /code\.read|Worker déployé/i);
  assert.match(search.next, /code\.search|default-bus/i);
  assert.match(release.next, /mémoire ONLINE|Professor|runtime UI|readiness/i);
});


test('GEN2-30 computer use abstraction is verified with explicit safety boundaries', () => {
  const row = byId('GEN2-30');
  assert.ok(row, 'missing roadmap item GEN2-30');
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.next, /OBSERVE|INTERACT|SENSITIVE|DENY/);
  assert.match(row.next, /sandbox/i);
  assert.match(row.next, /approbation explicite/i);
  assert.match(row.next, /audit/i);
});


test('MEL-WORK-03 central destructive approval gate is DONE_VERIFIED', () => {
  const row = byId('MEL-WORK-03');
  assert.ok(row, 'missing roadmap item MEL-WORK-03');
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.next, /Gate central fail-closed/i);
  assert.match(row.next, /confirm:true/);
  assert.match(row.next, /Work DAG/);
  assert.match(row.next, /Browser\/Computer/);
  assert.match(row.next, /35691866943/);
});
