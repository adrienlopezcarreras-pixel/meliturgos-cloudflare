import test from 'node:test';
import assert from 'node:assert/strict';

import { registerOpenLoopCapabilities } from '../../src/capabilities/open-loop-capabilities.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function fakeBus() {
  const handlers = new Map();
  return {
    discover(descriptor, handler) { handlers.set(descriptor.id, { descriptor, handler }); },
    async execute(id, input, context) {
      const row = handlers.get(id);
      if (!row) throw new Error('CAPABILITY_NOT_FOUND:'+id);
      return row.handler(input, context);
    },
    handlers,
  };
}

test('open-loop capabilities capture and list only the current owner', async () => {
  const DB = sqliteD1();
  const bus = fakeBus();
  registerOpenLoopCapabilities(bus, { env: { DB, MELITURGOS_USER: 'adrien' } });
  try {
    const first = await bus.execute('openloop.capture', {
      taskId: 'work-a',
      conversationId: 'conv-a',
      sourceEventId: 'event-1',
      priority: 7,
      nextAction: 'continue work',
      resumeAt: 0,
      metadata: { workDagId: 'work-a' },
    }, { owner: 'adrien' });

    const duplicate = await bus.execute('openloop.capture', {
      taskId: 'work-a',
      conversationId: 'conv-a',
      sourceEventId: 'event-1',
      nextAction: 'must not overwrite',
    }, { owner: 'adrien' });

    assert.equal(first.id, 'conv-a::work-a');
    assert.equal(duplicate.nextAction, 'continue work');

    const due = await bus.execute('openloop.due', { limit: 10 }, { owner: 'adrien' });
    assert.equal(due.count, 1);
    assert.equal(due.loops[0].owner, 'adrien');

    const other = await bus.execute('openloop.due', { limit: 10 }, { owner: 'other' });
    assert.equal(other.count, 0);
  } finally {
    DB.close();
  }
});

test('openloop.resume claims once and resumes the linked Work DAG through work.run', async () => {
  const DB = sqliteD1();
  const bus = fakeBus();
  let workRuns = 0;
  bus.discover({ id: 'work.run' }, async ({ id }) => {
    workRuns += 1;
    assert.equal(id, 'work-42');
    return { status: 'COMPLETED', id };
  });
  registerOpenLoopCapabilities(bus, { env: { DB, MELITURGOS_USER: 'adrien' } });

  try {
    await bus.execute('openloop.capture', {
      taskId: 'task-42',
      conversationId: 'conv-42',
      status: 'resumable',
      resumeAt: 0,
      metadata: { workDagId: 'work-42' },
    }, { owner: 'adrien' });

    const first = await bus.execute('openloop.resume', { limit: 5 }, { owner: 'adrien' });
    assert.equal(first.attempted, 1);
    assert.equal(first.succeeded, 1);
    assert.equal(first.advanced, 1, 'terminal transition is actual progress');
    assert.equal(first.deferred, 0);
    assert.equal(workRuns, 1);

    const second = await bus.execute('openloop.resume', { limit: 5 }, { owner: 'adrien' });
    assert.equal(second.attempted, 0);
    assert.equal(workRuns, 1);
  } finally {
    DB.close();
  }
});

test('openloop.resume keeps a loop resumable when no Work DAG can be resolved', async () => {
  const DB = sqliteD1();
  const bus = fakeBus();
  registerOpenLoopCapabilities(bus, { env: { DB, MELITURGOS_USER: 'adrien' } });
  try {
    await bus.execute('openloop.capture', {
      taskId: 'task-no-work',
      conversationId: 'conv-no-work',
      status: 'resumable',
      resumeAt: 0,
      metadata: { workDagId: '' },
    }, { owner: 'adrien' });

    const result = await bus.execute('openloop.resume', { limit: 1 }, { owner: 'adrien' });
    assert.equal(result.attempted, 1);
    assert.equal(result.failed, 0);

    const dueNow = await bus.execute('openloop.due', { limit: 10 }, { owner: 'adrien' });
    assert.equal(dueNow.count, 0);
  } finally {
    DB.close();
  }
});


test('resume remains truthful when another Work runner holds the D1 lease', async () => {
  const DB = sqliteD1();
  const bus = fakeBus();
  let attempts = 0;
  bus.discover({ id: 'work.run' }, async () => {
    attempts += 1;
    return { status: 'RUNNING', execution_started: false, lease_busy: true, node_counts: { COMPLETED: 0, PENDING: 2 } };
  });
  registerOpenLoopCapabilities(bus, { env: { DB, MELITURGOS_USER: 'adrien' } });
  try {
    await bus.execute('openloop.capture', {
      taskId:'busy-work', conversationId:'busy-conversation',
      status:'resumable', resumeAt:0,
      checkpoint:{ work:{status:'RUNNING',node_counts:{COMPLETED:0,PENDING:2}} },
      metadata:{workDagId:'busy-work'},
    },{owner:'adrien'});
    const result = await bus.execute('openloop.resume', {limit:1}, {owner:'adrien'});
    assert.equal(result.attempted,1);
    assert.equal(result.succeeded,1,'open-loop reschedule succeeded, not the work');
    assert.equal(result.advanced,0,'busy lease must never count as useful execution');
    assert.equal(result.deferred,1);
    assert.equal(result.outcomes[0].advanced,false);
    assert.equal(result.outcomes[0].deferred,true);
    assert.equal(result.outcomes[0].loop.metadata.last_work_advanced,false);
    assert.equal(attempts,1);
  } finally { DB.close(); }
});

test('resume counts a verified completed-node delta but not an unchanged RUNNING DAG', async () => {
  const DB=sqliteD1();
  const bus=fakeBus();
  let calls=0;
  bus.discover({id:'work.run'},async ()=>{
    calls+=1;
    return {status:'RUNNING',execution_started:true,node_counts:{COMPLETED:calls===1?1:1,PENDING:1}};
  });
  registerOpenLoopCapabilities(bus,{env:{DB,MELITURGOS_USER:'adrien'}});
  try {
    await bus.execute('openloop.capture',{
      taskId:'progress-job',conversationId:'progress-conversation',status:'resumable',resumeAt:0,
      checkpoint:{work:{status:'RUNNING',node_counts:{COMPLETED:0,PENDING:2}}},
      metadata:{workDagId:'progress-job'},
    },{owner:'adrien'});
    const first=await bus.execute('openloop.resume',{limit:1},{owner:'adrien'});
    assert.equal(first.advanced,1);
    assert.equal(first.deferred,0);
    assert.equal(first.outcomes[0].advanced,true);
    // Move the scheduled clock forward by updating the test row through a fresh
    // OpenLoopService store only; the next run still has no completed-node delta.
    const { createOpenLoopService }=await import('../../src/conversations/open-loop-service.js');
    const service=createOpenLoopService({DB});
    const loop=await service.store.get('progress-conversation::progress-job');
    await service.store.upsert({...loop,resumeAt:0},Date.now());
    const next=await bus.execute('openloop.resume',{limit:1},{owner:'adrien'});
    assert.equal(next.advanced,0);
    assert.equal(next.deferred,0);
    assert.equal(calls,2);
  } finally { DB.close(); }
});
