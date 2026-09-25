import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/index.js';
import { getHumanActionsRequired, HUMAN_ACTIONS_SCHEMA } from '../../src/roadmap/human-actions-required.js';
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
});

test('GEN2-62 report never promotes external or merely incomplete work to a human action', () => {
  const report = getHumanActionsRequired();
  const byId = new Map(flattenRoadmap().map(row => [row.id, row]));
  for (const action of report.actions) {
    assert.equal(byId.get(action.id)?.status, 'BLOCKED_HUMAN');
  }
});

test('GEN2-62 human actions are deterministic and priority ordered', () => {
  const first = getHumanActionsRequired();
  const second = getHumanActionsRequired();
  assert.deepEqual(first, second);
  const priorities = first.actions.map(row => Number(row.priority.slice(1)));
  assert.deepEqual(priorities, priorities.slice().sort((a, b) => a - b));
  assert.match(first.matrix_fingerprint, /^fnv1a-[0-9a-f]{8}$/);
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
