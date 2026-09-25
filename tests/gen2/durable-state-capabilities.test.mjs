import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCapabilityBus } from '../../src/capabilities/default-bus.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

const context = { owner:'owner', permissions:[], requestId:'durable-state-test' };

test('GEN2-12/13/40 capabilities are registered with truthful D1 health', () => {
  const noDb = createDefaultCapabilityBus({ env:{} });
  for (const id of [
    'timeline.append','timeline.list','timeline.get',
    'project.create','project.get','project.list','project.status.set',
    'decision.record','decision.get','decision.list','decision.status.set',
    'lesson.add','lesson.get','lesson.list',
    'event.publish','event.schedule','event.pull','event.ack','event.fail','event.get','event.list',
  ]) {
    assert.equal(noDb.contract(id).valid, true, id);
    assert.equal(noDb.describe(id).health, 'UNAVAILABLE', id);
  }

  const db = sqliteD1();
  try {
    const bus = createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    for (const id of ['timeline.list','project.list','decision.list','lesson.list','event.list']) {
      assert.equal(bus.describe(id).health, 'HEALTHY', id);
    }
  } finally {
    db.close();
  }
});

test('GEN2-12 Timeline survives CapabilityBus recreation through D1', async () => {
  const db = sqliteD1();
  try {
    const first = createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    await first.execute('timeline.append', {
      event_id:'timeline-proof-1',
      type:'roadmap.proof',
      title:'Timeline proof',
      description:'Durable timeline CapabilityBus proof',
      occurred_at:1000,
      source:'test',
      confidence:1,
      metadata:{ roadmap:'GEN2-12' },
    }, context);

    const second = createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    const rows = await second.execute('timeline.list', { type:'roadmap.proof', limit:10 }, context);
    assert.deepEqual(rows.map(row => row.event_id), ['timeline-proof-1']);
    assert.equal((await second.execute('timeline.get', { event_id:'timeline-proof-1' }, context)).metadata.roadmap, 'GEN2-12');
  } finally {
    db.close();
  }
});

test('GEN2-13 Projects Decisions Lessons survive CapabilityBus recreation through D1', async () => {
  const db = sqliteD1();
  try {
    const first = createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    await first.execute('project.create', {
      project_id:'project-proof-1',
      title:'Durable planning proof',
      objectives:['Prove D1 persistence'],
      status:'ACTIVE',
      created_at:1000,
      updated_at:1000,
      metadata:{ roadmap:'GEN2-13' },
    }, context);
    await first.execute('decision.record', {
      decision_id:'decision-proof-1',
      project_id:'project-proof-1',
      title:'Use durable D1',
      rationale:'Persistence is required across runtime recreation.',
      status:'ADOPTED',
      decided_at:1100,
      updated_at:1100,
      source:'test',
      confidence:1,
      metadata:{},
    }, context);
    await first.execute('lesson.add', {
      lesson_id:'lesson-proof-1',
      project_id:'project-proof-1',
      content:'Durable state must survive a new CapabilityBus instance.',
      learned_at:1200,
      source:'test',
      metadata:{},
    }, context);

    const second = createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    assert.deepEqual((await second.execute('project.list', {}, context)).map(row=>row.project_id), ['project-proof-1']);
    assert.deepEqual((await second.execute('decision.list', { project_id:'project-proof-1' }, context)).map(row=>row.decision_id), ['decision-proof-1']);
    assert.deepEqual((await second.execute('lesson.list', { project_id:'project-proof-1' }, context)).map(row=>row.lesson_id), ['lesson-proof-1']);
  } finally {
    db.close();
  }
});

test('GEN2-40 Event Bus persists idempotent delivery state through D1', async () => {
  const db = sqliteD1();
  try {
    const first = createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    const published = await first.execute('event.publish', {
      event_id:'event-proof-1',
      topic:'roadmap.proof',
      source:'test',
      idempotency_key:'event-proof-key-1',
      payload:{ roadmap:'GEN2-40' },
      created_at:1000,
      metadata:{},
    }, context);
    assert.equal(published.deduplicated, false);

    const duplicate = await first.execute('event.publish', {
      event_id:'event-proof-duplicate-id',
      topic:'roadmap.proof',
      source:'test',
      idempotency_key:'event-proof-key-1',
      payload:{ roadmap:'GEN2-40' },
      created_at:1001,
      metadata:{},
    }, context);
    assert.equal(duplicate.deduplicated, true);
    assert.equal(duplicate.event.event_id, 'event-proof-1');

    const leased = await first.execute('event.pull', {
      consumer:'worker-proof',
      topic:'roadmap.proof',
      now:1000,
      limit:1,
      lease_ms:1000,
    }, context);
    assert.equal(leased.length, 1);
    assert.equal(leased[0].event.event_id, 'event-proof-1');

    await first.execute('event.ack', {
      event_id:'event-proof-1',
      consumer:'worker-proof',
      lease_token:leased[0].delivery.lease_token,
      acknowledged_at:1100,
    }, context);

    const second = createDefaultCapabilityBus({ env:{ DB:db, MELITURGOS_USER:'owner' } });
    const rows = await second.execute('event.list', { topic:'roadmap.proof' }, context);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'ACKED');
  } finally {
    db.close();
  }
});

test('read-only durable-state release capabilities fail closed without D1', async () => {
  const bus = createDefaultCapabilityBus({ env:{} });
  for (const id of ['timeline.list','project.list','event.list']) {
    await assert.rejects(() => bus.execute(id, {}, context), { code:'CAPABILITY_UNAVAILABLE' });
  }
});
