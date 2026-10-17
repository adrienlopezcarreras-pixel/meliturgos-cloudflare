import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCapabilityBus } from '../../src/capabilities/default-bus.js';
import { createOpenLoopService } from '../../src/conversations/open-loop-service.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

const context = { owner: 'adrien', requestId: 'context-03-work-link', permissions: [] };

test('MEL-CONTEXT-03 Work keeps a durable conversation-linked open-loop checkpoint', async () => {
  const DB = sqliteD1();
  const bus = createDefaultCapabilityBus({ env: { DB, MELITURGOS_USER: 'adrien' } });
  const loops = createOpenLoopService({ DB });
  try {
    const created = await bus.execute('work.create', {
      id: 'linked-work',
      conversationId: 'conv-linked',
      goal: 'Finish linked work',
      nodes: [{ id: 'one', kind: 'TASK', idempotent: true, payload: { capability: 'echo', input: { value: 'done' } } }],
    }, context);
    assert.equal(created.status, 'RUNNING');

    let loop = await loops.store.get('conv-linked::linked-work');
    assert.equal(loop.status, 'waiting');
    assert.equal(loop.resumeAt, Number.MAX_SAFE_INTEGER);
    assert.equal(loop.metadata.workDagId, 'linked-work');
    assert.equal(loop.checkpoint.work.status, 'RUNNING');

    const completed = await bus.execute('work.run', { id: 'linked-work' }, context);
    assert.equal(completed.status, 'COMPLETED');
    loop = await loops.store.get('conv-linked::linked-work');
    assert.equal(loop.status, 'completed');
    assert.equal(loop.checkpoint.work.status, 'COMPLETED');
  } finally {
    DB.close();
  }
});

test('MEL-CONTEXT-03 blocked Work becomes passive instead of retry-looping', async () => {
  const DB = sqliteD1();
  const bus = createDefaultCapabilityBus({ env: { DB, MELITURGOS_USER: 'adrien' } });
  const loops = createOpenLoopService({ DB });
  try {
    await bus.execute('work.create', {
      id: 'blocked-linked-work',
      conversationId: 'conv-blocked',
      goal: 'Stay blocked safely',
      nodes: [{ id: 'recursive', kind: 'TASK', idempotent: true, payload: { capability: 'work.status', input: { id: 'blocked-linked-work' } } }],
    }, context);

    const result = await bus.execute('work.run', { id: 'blocked-linked-work' }, context);
    assert.equal(result.status, 'BLOCKED');

    const loop = await loops.store.get('conv-blocked::blocked-linked-work');
    assert.equal(loop.status, 'waiting');
    assert.equal(loop.resumeAt, Number.MAX_SAFE_INTEGER);
    const due = await bus.execute('openloop.due', { limit: 10 }, context);
    assert.equal(due.count, 0);
  } finally {
    DB.close();
  }
});

test('MEL-CONTEXT-03 plan handoff closes the plan loop and opens the Work checkpoint', async () => {
  const DB = sqliteD1();
  const bus = createDefaultCapabilityBus({ env: { DB, MELITURGOS_USER: 'adrien' } });
  const loops = createOpenLoopService({ DB });
  try {
    const saved = await bus.execute('work.plan.save', {
      id: 'linked-plan',
      conversationId: 'conv-plan',
      goal: 'Materialize linked plan',
      steps: [{ id: 'one', capability: 'echo', input: { value: 'one' }, idempotent: true }],
    }, context);
    assert.equal(saved.conversation_id, 'conv-plan');
    let planLoop = await loops.store.get('conv-plan::linked-plan');
    assert.equal(planLoop.status, 'waiting');

    const materialized = await bus.execute('work.plan.materialize', { id: 'linked-plan' }, context);
    assert.equal(materialized.plan.work_dag_id, 'work-linked-plan');

    planLoop = await loops.store.get('conv-plan::linked-plan');
    assert.equal(planLoop.status, 'completed');
    const workLoop = await loops.store.get('conv-plan::work-linked-plan');
    assert.equal(workLoop.status, 'waiting');
    assert.equal(workLoop.metadata.workDagId, 'work-linked-plan');
    assert.equal(workLoop.checkpoint.work.status, 'RUNNING');
  } finally {
    DB.close();
  }
});


test('openloop.resume owns the single checkpoint commit when Work run advances a node', async () => {
  const DB = sqliteD1();
  const bus = createDefaultCapabilityBus({ env: { DB, MELITURGOS_USER: 'adrien' } });
  const loops = createOpenLoopService({ DB });
  const conversationId = 'claimed-conversation';
  const dagId = 'claimed-work';
  try {
    await bus.execute('work.create', {
      id: dagId, conversationId, goal: 'Process two safe steps',
      nodes: [
        { id: 'one', kind: 'TASK', idempotent: true, payload: { capability:'echo', input:{value:'first'} } },
        { id: 'two', kind: 'TASK', depends_on:['one'], idempotent: true, payload: { capability:'echo', input:{value:'second'} } },
      ],
    }, context);
    await bus.execute('openloop.capture', {
      taskId: dagId, conversationId, status:'resumable', resumeAt:0,
      checkpoint:{work:{status:'RUNNING',node_counts:{PENDING:2,COMPLETED:0}}},
      metadata:{workDagId:dagId},
    }, context);
    const result = await bus.execute('openloop.resume', {limit:1}, context);
    assert.equal(result.attempted,1);
    assert.equal(result.succeeded,1);
    assert.equal(result.advanced,1,'verified node advancement must survive CAS commit');
    assert.equal(result.deferred,0);
    const persisted = await loops.store.get(`${conversationId}::${dagId}`);
    assert.equal(persisted.status,'resumable');
    assert.equal(persisted.leaseToken,null);
    assert.equal(persisted.checkpoint.work.node_counts.COMPLETED,1);
    assert.equal(persisted.metadata.last_work_advanced,true);
    const due = await bus.execute('openloop.due',{limit:10},context);
    assert.equal(due.count,0);
  } finally {DB.close();}
});
