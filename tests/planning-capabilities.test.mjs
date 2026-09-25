import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { prepareGen2 } from '../src/persistence/gen2-schema.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const context = { owner: 'adrien', permissions: [], requestId: 'planning-capabilities-test' };

const project = {
  project_id: 'mel-roadmap',
  title: 'MEL Roadmap',
  objectives: ['Finish durable core capabilities'],
  status: 'ACTIVE',
  created_at: 1000,
  updated_at: 1000,
  metadata: { source: 'owner' },
};

test('planning capabilities expose truthful health and bounded contracts', () => {
  const unavailable = createDefaultCapabilityBus({ env: {} });
  for (const id of ['timeline.list','project.create','project.list','decision.record','decision.list','lesson.add','lesson.list']) {
    assert.equal(unavailable.describe(id).health, 'DEGRADED');
    assert.equal(unavailable.contract(id).valid, true);
  }

  const db = sqliteD1();
  try {
    const available = createDefaultCapabilityBus({ env: { DB: db } });
    for (const id of ['timeline.append','timeline.list','project.create','project.list','decision.record','lesson.add']) {
      assert.equal(available.describe(id).health, 'HEALTHY');
    }
    assert.equal(available.describe('project.create').risk, 'MEDIUM');
    assert.equal(available.describe('project.list').risk, 'LOW');
  } finally {
    db.close();
  }
});

test('CapabilityBus persists and restores timeline, projects, decisions and lessons through D1', async () => {
  const db = sqliteD1();
  try {
    await prepareGen2(db);
    const first = createDefaultCapabilityBus({ env: { DB: db, MELITURGOS_USER: 'adrien' } });

    await first.execute('project.create', project, context);
    await first.execute('decision.record', {
      decision_id: 'decision-1',
      project_id: 'mel-roadmap',
      title: 'Use one canonical CapabilityBus',
      rationale: 'Avoid duplicate orchestration paths',
      status: 'ADOPTED',
      decided_at: 1200,
      updated_at: 1200,
      source: 'owner',
      confidence: 1,
      metadata: {},
    }, context);
    await first.execute('lesson.add', {
      lesson_id: 'lesson-1',
      project_id: 'mel-roadmap',
      content: 'Keep mobile surfaces frozen while core work proceeds.',
      learned_at: 1300,
      source: 'roadmap',
      metadata: {},
    }, context);
    await first.execute('timeline.append', {
      event_id: 'event-1',
      type: 'project.decision',
      title: 'CapabilityBus decision recorded',
      description: 'GEN2-13 decision persisted.',
      occurred_at: 1200,
      source: 'planning',
      confidence: 1,
      metadata: { project_id: 'mel-roadmap', decision_id: 'decision-1' },
    }, context);

    const second = createDefaultCapabilityBus({ env: { DB: db, MELITURGOS_USER: 'adrien' } });
    assert.deepEqual((await second.execute('project.list', {}, context)).map(row => row.project_id), ['mel-roadmap']);
    assert.deepEqual((await second.execute('decision.list', { project_id: 'mel-roadmap' }, context)).map(row => row.decision_id), ['decision-1']);
    assert.deepEqual((await second.execute('lesson.list', { project_id: 'mel-roadmap' }, context)).map(row => row.lesson_id), ['lesson-1']);
    assert.deepEqual((await second.execute('timeline.list', { type: 'project.decision' }, context)).map(row => row.event_id), ['event-1']);

    const updated = await second.execute('project.status.set', {
      project_id: 'mel-roadmap',
      status: 'PAUSED',
      changed_at: 1400,
      reason: 'test transition',
    }, context);
    assert.equal(updated.status, 'PAUSED');
    assert.equal((await second.execute('project.get', { project_id: 'mel-roadmap' }, context)).status, 'PAUSED');
  } finally {
    db.close();
  }
});

test('planning CapabilityBus writes fail closed without D1', async () => {
  const bus = createDefaultCapabilityBus({ env: {} });
  await assert.rejects(
    () => bus.execute('project.create', project, context),
    error => error.code === 'PLANNING_DB_REQUIRED' || error.code === 'CAPABILITY_UNAVAILABLE',
  );
});
