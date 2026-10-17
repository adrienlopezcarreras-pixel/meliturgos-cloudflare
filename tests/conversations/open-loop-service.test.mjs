import assert from 'node:assert/strict';
import test from 'node:test';

import {
  D1OpenLoopStore,
  MemoryOpenLoopStore,
  OpenLoopService,
  openLoopId,
} from '../../src/conversations/open-loop-service.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

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


for (const kind of ['memory', 'd1']) {
  test(`expired ${kind} resume leases recover and a stale success cannot overwrite a newer worker`, async () => {
    const DB = kind === 'd1' ? sqliteD1() : null;
    const store = kind === 'd1' ? new D1OpenLoopStore(DB) : new MemoryOpenLoopStore();
    let now = 1000;
    let seq = 0;
    const service = new OpenLoopService(store, { now: () => now, id: () => `lease-${++seq}` });
    let entered;
    const firstEntered = new Promise(resolve => { entered = resolve; });
    let unblock;
    const oldBlocked = new Promise(resolve => { unblock = resolve; });
    try {
      await service.capture({
        conversationId: 'conv', taskId: 'task', status: 'resumable',
        resumeAt: 0, metadata: { version: 'before' },
      });
      const first = service.resumeDue({
        leaseMs: 1000,
        execute: async () => {
          entered();
          await oldBlocked;
          return { completed: true, metadata: { version: 'stale' } };
        },
      });
      await firstEntered;
      now = 1500;
      const busy = await service.resumeDue({
        leaseMs: 1000,
        execute: async () => { throw Error('LIVE_LEASE_WAS_STOLEN'); },
      });
      assert.equal(busy.length, 0, 'an unexpired claim cannot be stolen');

      now = 2001;
      const recovered = await service.resumeDue({
        leaseMs: 1000,
        execute: async () => ({ completed: true, metadata: { version: 'new-worker' } }),
      });
      assert.equal(recovered.length, 1, 'expired resuming row must become runnable');
      assert.equal(recovered[0].ok, true);
      assert.equal(recovered[0].loop.metadata.version, 'new-worker');

      unblock();
      const stale = await first;
      assert.equal(stale.length, 1);
      assert.equal(stale[0].ok, false);
      assert.equal(stale[0].deferred, true);
      assert.equal(stale[0].error, 'OPEN_LOOP_CLAIM_SUPERSEDED');

      const final = await store.get('conv::task');
      assert.equal(final.status, 'completed');
      assert.equal(final.metadata.version, 'new-worker');
      assert.equal(final.leaseToken, null);
    } finally {
      unblock?.();
      DB?.close();
    }
  });

  test(`expired ${kind} failed worker cannot reset successor checkpoint`, async () => {
    const DB = kind === 'd1' ? sqliteD1() : null;
    const store = kind === 'd1' ? new D1OpenLoopStore(DB) : new MemoryOpenLoopStore();
    let now = 4000;
    let seq = 0;
    const service = new OpenLoopService(store, { now: () => now, id: () => `lease-${++seq}` });
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let unblock;
    const blocked = new Promise(resolve => { unblock = resolve; });
    try {
      await service.capture({ conversationId: 'conv', taskId: 'retry', status: 'resumable', resumeAt: 0 });
      const first = service.resumeDue({
        leaseMs: 1000, execute: async () => { entered(); await blocked; throw Error('stale failure'); },
      });
      await started;
      now = 5001;
      const next = await service.resumeDue({
        leaseMs: 1000,
        execute: async () => ({
          status: 'resumable', resumeAt: 9000,
          checkpoint: { cursor: 2 }, metadata: { version: 'newer' },
        }),
      });
      assert.equal(next[0].ok, true);
      unblock();
      const stale = await first;
      assert.equal(stale[0].deferred, true);
      const saved = await store.get('conv::retry');
      assert.equal(saved.status, 'resumable');
      assert.equal(saved.resumeAt, 9000);
      assert.deepEqual(saved.checkpoint, { cursor: 2 });
      assert.equal(saved.metadata.version, 'newer');
      assert.equal(saved.metadata.lastError, undefined);
    } finally {
      unblock?.();
      DB?.close();
    }
  });
}
