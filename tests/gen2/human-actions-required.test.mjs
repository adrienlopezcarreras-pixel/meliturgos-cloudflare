import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/index.js';
import { generateCompletionMatrix } from '../../src/roadmap/completion-matrix.js';
import {
  getHumanActionsRequired,
  HUMAN_ACTIONS_SCHEMA,
  validateHumanActionsRequired,
} from '../../src/roadmap/human-actions-required.js';
import { flattenRoadmap } from '../../src/roadmap/master-roadmap.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function env() {
  return { DB: sqliteD1(), MELITURGOS_USER:'test', MELITURGOS_PASSWORD:'test-only' };
}

function auth() {
  return { authorization:`Basic ${Buffer.from('test:test-only').toString('base64')}` };
}

test('GEN2-62 report contains exactly the explicit BLOCKED_HUMAN roadmap items', () => {
  const report = getHumanActionsRequired();
  const expected = flattenRoadmap().filter(row => row.status === 'BLOCKED_HUMAN');
  assert.equal(report.schema, HUMAN_ACTIONS_SCHEMA);
  assert.equal(report.count, expected.length);
  assert.equal(report.requires_human_action, expected.length > 0);
  assert.deepEqual(new Set(report.actions.map(row => row.id)), new Set(expected.map(row => row.id)));
  assert.ok(report.actions.every(row => row.instruction.length > 0));
  assert.ok(report.actions.every(row => row.resolution_criterion.length > 0));
});

test('GEN2-62 report never promotes external or merely incomplete work to a human action', () => {
  const report = getHumanActionsRequired();
  const byId = new Map(flattenRoadmap().map(row => [row.id, row]));
  for (const action of report.actions) {
    assert.equal(byId.get(action.id)?.status, 'BLOCKED_HUMAN');
    assert.equal(action.status, 'BLOCKED_HUMAN');
  }
});

test('GEN2-62 human actions are deterministic, priority ordered and provenance-bound', () => {
  const matrix = generateCompletionMatrix();
  const first = getHumanActionsRequired({ matrix });
  const second = getHumanActionsRequired({ matrix });
  assert.deepEqual(first, second);

  const priorities = first.actions.map(row => Number(row.priority.slice(1)));
  assert.deepEqual(priorities, priorities.slice().sort((a, b) => a - b));
  assert.match(first.matrix_fingerprint, /^fnv1a-[0-9a-f]{8}$/);

  for (const action of first.actions) {
    assert.equal(action.source.path, matrix.source);
    assert.equal(action.source.registry_revision, matrix.registry_revision);
    assert.equal(action.source.matrix_fingerprint, matrix.matrix_fingerprint);
    assert.equal(action.source.roadmap_item_id, action.id);
    assert.equal(action.source.roadmap_status, 'BLOCKED_HUMAN');
  }
});

test('GEN2-62 validation rejects ghost blockers', () => {
  const matrix = generateCompletionMatrix();
  const report = getHumanActionsRequired({ matrix });
  const fake = structuredClone(report);
  fake.actions.push({
    id:'GHOST-1',
    phase_id:'X',
    priority:'P1',
    status:'BLOCKED_HUMAN',
    title:'ghost',
    instruction:'ghost',
    resolution_criterion:'ghost',
    source:{
      path:matrix.source,
      registry_revision:matrix.registry_revision,
      matrix_fingerprint:matrix.matrix_fingerprint,
      roadmap_item_id:'GHOST-1',
      roadmap_status:'BLOCKED_HUMAN',
    },
  });
  fake.count = fake.actions.length;
  const validation = validateHumanActionsRequired(fake, { matrix });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('HUMAN_ACTION_GHOST:GHOST-1'));
});

test('GEN2-62 validation rejects duplicate blockers', () => {
  const matrix = generateCompletionMatrix();
  const report = getHumanActionsRequired({ matrix });
  if (!report.actions.length) return;
  const duplicate = structuredClone(report);
  duplicate.actions.push(structuredClone(duplicate.actions[0]));
  duplicate.count = duplicate.actions.length;
  const validation = validateHumanActionsRequired(duplicate, { matrix });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes(`HUMAN_ACTION_DUPLICATE:${report.actions[0].id}`));
});

test('GEN2-62 validation rejects stale provenance and missing real blockers', () => {
  const matrix = generateCompletionMatrix();
  const report = getHumanActionsRequired({ matrix });
  if (!report.actions.length) return;

  const stale = structuredClone(report);
  stale.actions[0].source.matrix_fingerprint = 'stale-fingerprint';
  const staleValidation = validateHumanActionsRequired(stale, { matrix });
  assert.equal(staleValidation.ok, false);
  assert.ok(staleValidation.issues.includes(`HUMAN_ACTION_FINGERPRINT_MISMATCH:${report.actions[0].id}`));

  const missing = structuredClone(report);
  missing.actions.shift();
  missing.count = missing.actions.length;
  missing.requires_human_action = missing.actions.length > 0;
  const missingValidation = validateHumanActionsRequired(missing, { matrix });
  assert.equal(missingValidation.ok, false);
  assert.ok(missingValidation.issues.includes(`HUMAN_ACTION_MISSING:${report.actions[0].id}`));
});

test('GEN2-62 exposes the same contract through the versioned authenticated API', async () => {
  const response = await worker.fetch(new Request('http://localhost/api/v1/human-actions-required', {
    headers: auth(),
  }), env(), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-mel-api-version'), 'v1');
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.schema, HUMAN_ACTIONS_SCHEMA);
  assert.equal(body.count, getHumanActionsRequired().count);
});
