import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROADMAP_REGISTRY_REVISION,
  flattenRoadmap,
  getRoadmapPayload,
  validateRoadmap,
} from '../src/roadmap/master-roadmap.js';

function byId(id) {
  return flattenRoadmap().find(row => row.id === id);
}

test('roadmap registry stays structurally unique and exposes its revision', () => {
  const validation = validateRoadmap();
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  assert.match(ROADMAP_REGISTRY_REVISION, /^\d{4}-\d{2}-\d{2}\./);
  const payload = getRoadmapPayload();
  assert.equal(payload.source.kind, 'code_registry');
  assert.equal(payload.source.file, 'src/roadmap/master-roadmap.js');
  assert.equal(payload.source.revision, ROADMAP_REGISTRY_REVISION);
});

test('verified pre-LLM context interpreter is represented in the roadmap', () => {
  const row = byId('MEL-CONTEXT-04');
  assert.ok(row);
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.title, /pré-LLM/i);
});

test('HD theme cleanup stays consolidated under the canonical control center deliverable', () => {
  assert.equal(byId('MEL-UI-04'), undefined);
  const row = byId('GEN2-54');
  assert.ok(row);
  assert.match(row.next, /une seule couche de présentation/i);
});

test('browser abstraction is partial until a real adapter is wired', () => {
  const row = byId('GEN2-31');
  assert.ok(row);
  assert.equal(row.status, 'PARTIAL');
  assert.match(row.next, /adapter navigateur réel/i);
});

test('canary rollback verification stays tied to the recorded real proof', () => {
  const row = byId('GEN2-53');
  assert.ok(row);
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.next, /Actions run 35093195456/i);
});