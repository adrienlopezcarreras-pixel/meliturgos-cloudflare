import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MemoryOpenLoopStore,
  OpenLoopService,
  openLoopId,
} from '../../src/conversations/open-loop-service.js';

test('openLoopId requires and links conversation + task', () => {
  assert.equal(openLoopId({ conversationId: 'conv-1', taskId: 'task-9' }), 'conv-1::task-9');
  assert.throws(() => openLoopId({ conversationId: 'conv-1' }), /taskId required/);
  assert.throws(() => openLoopId({ taskId: 'task-9' }), /conversationId required/);
});

test('capture is idempotent for the same source event and preserves the link', async () => {
  let now = 1000;
  const store = new MemoryOpenLoopStore();
  const service = new OpenLoopService(store, { now: () => now, id: () => 'lease-1' });

  const first = await service.capture({
    conversationId: 'conv-a',
    taskId: 'task-a',
    owner: 'adrien',
    sourceEventId: 'event-1',
    nextAction: 'continue roadmap',
    checkpoint: { step: 3 },
  });

  now = 2000;
  const duplicate = await service.capture({
    conversationId: 'conv-a',
    taskId: 'task-a',
    owner: 'adrien',
    sourceEventId: 'event-1',
    nextAction: 'must not replace',
  });

  assert.equal(first.id, 'conv-a::task-a');
  assert.equal(duplicate.updatedAt, 1000);
  assert.equal(duplicate.nextAction, 'continue roadmap');
  assert.deepEqual(duplicate.checkpoint, { step: 3 });
});

test('events move an open loop between waiting, resumable and completed', async () => {
  let now = 1000;
  const store = new MemoryOpenLoopStore();
  const service = new OpenLoopService(store, { now: () => now, id: () => 'lease-2' });

  await service.capture({ conversationId: 'conv-b', taskId: 'task-b', status: 'open' });

  now = 2000;
  const waiting = await service.recordEvent({
    conversationId: 'conv-b',
    taskId: 'task-b',
    type: 'work.waiting',
    payload: { eventId: 'event-w', resumeAt: 5000, nextAction: 'wait for dependency' },
  });
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.resumeAt, 5000);

  now = 3000;
  const resumable = await service.recordEvent({
    conversationId: 'conv-b',
    taskId: 'task-b',
    type: 'checkpoint.ready',
    payload: { eventId: 'event-r', resumeAt: 3000, checkpoint: { ready: true } },
  });
  assert.equal(resumable.status, 'resumable');
  assert.deepEqual(resumable.checkpoint, { ready: true });

  now = 4000;
  const completed = await service.recordEvent({
    conversationId: 'conv-b',
    taskId: 'task-b',
    type: 'work.completed',
    payload: { eventId: 'event-done' },
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedAt, 4000);
  assert.deepEqual(await store.listDue({ now: 10_000 }), []);
});

test('resumeDue respects due time and priority, leases once, and persists completion', async () => {
  let now = 10_000;
  let lease = 0;
  const store = new MemoryOpenLoopStore();
  const service = new OpenLoopService(store, {
    now: () => now,
    id: () => `lease-${++lease}`,
  });

  await service.capture({ conversationId: 'conv-c', taskId: 'low', priority: 1, resumeAt: 5000 });
  await service.capture({ conversationId: 'conv-c', taskId: 'high', priority: 9, resumeAt: 9000 });
  await service.capture({ conversationId: 'conv-c', taskId: 'future', priority: 99, resumeAt: 20_000 });

  const executionOrder = [];
  const outcomes = await service.resumeDue({
    execute: async (loop) => {
      executionOrder.push(loop.taskId);
      return loop.taskId === 'high'
        ? { completed: true, metadata: { proof: 'ok' } }
        : { status: 'resumable', resumeAt: 15_000, nextAction: 'second pass' };
    },
  });

  assert.deepEqual(executionOrder, ['high', 'low']);
  assert.equal(outcomes.length, 2);
  assert.equal((await store.get('conv-c::high')).status, 'completed');
  assert.equal((await store.get('conv-c::high')).metadata.proof, 'ok');
  assert.equal((await store.get('conv-c::low')).status, 'resumable');
  assert.equal((await store.get('conv-c::low')).resumeAt, 15_000);
  assert.equal((await store.get('conv-c::future')).status, 'open');
});

test('resumeDue records failures and schedules a safe retry without losing checkpoint', async () => {
  const now = 50_000;
  const store = new MemoryOpenLoopStore();
  const service = new OpenLoopService(store, { now: () => now, id: () => 'lease-failure' });

  await service.capture({
    conversationId: 'conv-d',
    taskId: 'task-d',
    checkpoint: { cursor: 42 },
    resumeAt: 0,
  });

  const outcomes = await service.resumeDue({
    retryDelayMs: 30_000,
    execute: async () => { throw new Error('temporary provider outage'); },
  });

  assert.equal(outcomes[0].ok, false);
  const saved = await store.get('conv-d::task-d');
  assert.equal(saved.status, 'failed');
  assert.equal(saved.resumeAt, 80_000);
  assert.deepEqual(saved.checkpoint, { cursor: 42 });
  assert.equal(saved.metadata.lastError, 'temporary provider outage');
  assert.equal(saved.leaseToken, null);
});
