import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTINUITY_EVENT_TOPICS,
  CoreContinuityCoordinator,
} from '../../src/core/continuity-coordinator.js';

test('restart inspection is read-only and does not call repair paths', async () => {
  const calls = [];
  const coordinator = new CoreContinuityCoordinator({
    restartSnapshot: {
      build: async options => {
        calls.push(['snapshot', options]);
        return { schema: 'mel.restart-snapshot/v1', owner: options.owner };
      },
    },
    historyReconciler: {
      reconcileAll: async () => {
        calls.push(['history']);
        return {};
      },
    },
    timelineProjector: {
      consumeTopic: async topic => {
        calls.push(['project', topic]);
        return [];
      },
    },
  });

  const result = await coordinator.inspectRestart({ owner: 'adrien' });
  assert.equal(result.owner, 'adrien');
  assert.deepEqual(calls, [['snapshot', { owner: 'adrien' }]]);
});

test('continuity repair replays durable history before projecting topics', async () => {
  const calls = [];
  const coordinator = new CoreContinuityCoordinator({
    historyReconciler: {
      reconcileAll: async options => {
        calls.push(['history', options]);
        return { planning: { emitted: 2 }, work: { emitted: 1 } };
      },
    },
    timelineProjector: {
      consumeTopic: async options => {
        calls.push(['project', options.topic]);
        return [{ ok: true, event_id: `evt-${options.topic}` }];
      },
    },
  });

  const result = await coordinator.repairContinuity({
    topics: ['project.created', 'work.completed'],
    planningLimit: 20,
    workLimit: 10,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'REPAIRED');
  assert.equal(calls[0][0], 'history');
  assert.deepEqual(calls.slice(1).map(row => row[1]), ['project.created', 'work.completed']);
  assert.equal(result.projections[0].projected, 1);
});

test('projection failure is reported but does not prevent later topics from draining', async () => {
  const calls = [];
  const coordinator = new CoreContinuityCoordinator({
    historyReconciler: {
      reconcileAll: async () => ({ planning: null, work: null }),
    },
    timelineProjector: {
      consumeTopic: async ({ topic }) => {
        calls.push(topic);
        if (topic === 'project.status') throw Object.assign(new Error('TIMELINE_DOWN'), { code: 'TIMELINE_DOWN' });
        return [{ ok: true }];
      },
    },
  });

  const result = await coordinator.repairContinuity({
    topics: ['project.status', 'decision.status'],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(calls, ['project.status', 'decision.status']);
  assert.deepEqual(result.failures, [{ topic: 'project.status', error: 'TIMELINE_DOWN' }]);
  assert.equal(result.projections[1].projected, 1);
});

test('recover repairs first then builds a fresh snapshot', async () => {
  const order = [];
  const coordinator = new CoreContinuityCoordinator({
    historyReconciler: {
      reconcileAll: async () => {
        order.push('history');
        return {};
      },
    },
    timelineProjector: {
      consumeTopic: async ({ topic }) => {
        order.push(`project:${topic}`);
        return [];
      },
    },
    restartSnapshot: {
      build: async ({ owner }) => {
        order.push('snapshot');
        return { owner, resume_queue: [] };
      },
    },
  });

  const result = await coordinator.recover({
    owner: 'adrien',
    repair: { topics: ['work.completed'] },
  });

  assert.deepEqual(order, ['history', 'project:work.completed', 'snapshot']);
  assert.equal(result.status, 'RECOVERED');
  assert.equal(result.snapshot.owner, 'adrien');
});

test('learning skill synchronization is delegated only through the evidence bridge', async () => {
  const calls = [];
  const coordinator = new CoreContinuityCoordinator({
    skillBridge: {
      syncLearningEngine: async options => {
        calls.push(options);
        return { synced: true, record: { version: options.version } };
      },
    },
  });

  const result = await coordinator.syncLearningSkill({
    skillId: 'skill.learned',
    version: 'v1',
  });

  assert.equal(result.synced, true);
  assert.equal(result.record.version, 'v1');
  assert.deepEqual(calls, [{ skillId: 'skill.learned', version: 'v1' }]);
});

test('default continuity topic set covers Work, planning and learning-history facts', () => {
  for (const topic of [
    'work.created',
    'work.completed',
    'project.created',
    'project.status',
    'decision.recorded',
    'decision.status',
    'lesson.added',
  ]) {
    assert.ok(CONTINUITY_EVENT_TOPICS.includes(topic));
  }
});
