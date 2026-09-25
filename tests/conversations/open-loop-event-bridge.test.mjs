import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryEventBusAdapter, EVENT_STATUSES } from '../../src/events/event-bus.js';
import {
  MemoryOpenLoopStore,
  OpenLoopService,
} from '../../src/conversations/open-loop-service.js';
import {
  OPEN_LOOP_EVENT_TYPES,
  OpenLoopEventBridge,
} from '../../src/conversations/open-loop-event-bridge.js';

function event({ id, topic, key = id, payload, createdAt = 1_000 }) {
  return {
    event_id: id,
    topic,
    source: 'work-engine',
    idempotency_key: key,
    payload,
    created_at: createdAt,
    metadata: {},
  };
}

test('bridge supports the canonical task/work lifecycle topics', () => {
  for (const topic of ['work.waiting', 'checkpoint.ready', 'work.completed', 'task.failed']) {
    assert.ok(OPEN_LOOP_EVENT_TYPES.includes(topic));
  }
});

test('work event is consumed, persisted as an open loop, and acked', async () => {
  let now = 2_000;
  const bus = createInMemoryEventBusAdapter();
  const store = new MemoryOpenLoopStore();
  const openLoops = new OpenLoopService(store, { now: () => now, id: () => 'lease-open-loop' });
  const bridge = new OpenLoopEventBridge({ eventBus: bus, openLoops, now: () => now });

  await bus.publish(event({
    id: 'evt-wait',
    topic: 'work.waiting',
    payload: {
      taskId: 'task-1',
      conversationId: 'conv-1',
      owner: 'owner-1',
      nextAction: 'resume after dependency',
      resumeAt: 9_000,
      checkpoint: { step: 4 },
    },
  }));

  const outcomes = await bridge.consumeTopic({ topic: 'work.waiting', consumer: 'open-loop-worker' });
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].ok, true);

  const loop = await store.get('conv-1::task-1');
  assert.equal(loop.status, 'waiting');
  assert.equal(loop.resumeAt, 9_000);
  assert.equal(loop.nextAction, 'resume after dependency');
  assert.deepEqual(loop.checkpoint, { step: 4 });
  assert.equal(loop.sourceEventId, 'evt-wait');
  assert.equal(loop.metadata.event_bus_topic, 'work.waiting');

  const transport = await bus.get({ event_id: 'evt-wait' });
  assert.equal(transport.status, EVENT_STATUSES.ACKED);
});

test('completion event closes an existing open loop without losing checkpoint', async () => {
  let now = 3_000;
  const bus = createInMemoryEventBusAdapter();
  const store = new MemoryOpenLoopStore();
  const openLoops = new OpenLoopService(store, { now: () => now, id: () => 'lease-open-loop' });
  const bridge = new OpenLoopEventBridge({ eventBus: bus, openLoops, now: () => now });

  await openLoops.capture({
    conversationId: 'conv-2',
    taskId: 'task-2',
    owner: 'owner-2',
    checkpoint: { cursor: 42 },
    status: 'resumable',
  });

  await bus.publish(event({
    id: 'evt-done',
    topic: 'work.completed',
    payload: { taskId: 'task-2', conversationId: 'conv-2', owner: 'owner-2' },
    createdAt: now,
  }));

  const outcomes = await bridge.consumeTopic({ topic: 'work.completed' });
  assert.equal(outcomes[0].ok, true);

  const loop = await store.get('conv-2::task-2');
  assert.equal(loop.status, 'completed');
  assert.equal(loop.completedAt, now);
  assert.deepEqual(loop.checkpoint, { cursor: 42 });
});

test('invalid open-loop event is failed through Event Bus instead of being acked', async () => {
  const now = 4_000;
  const bus = createInMemoryEventBusAdapter();
  const store = new MemoryOpenLoopStore();
  const openLoops = new OpenLoopService(store, { now: () => now, id: () => 'lease-open-loop' });
  const bridge = new OpenLoopEventBridge({ eventBus: bus, openLoops, now: () => now });

  await bus.publish(event({
    id: 'evt-bad',
    topic: 'task.failed',
    payload: { taskId: 'task-3' },
    createdAt: now,
  }));

  const outcomes = await bridge.consumeTopic({
    topic: 'task.failed',
    maxAttempts: 1,
    retryDelayMs: 5_000,
  });

  assert.equal(outcomes[0].ok, false);
  assert.match(outcomes[0].error, /CONVERSATION_REQUIRED/);
  assert.equal(await store.get('::task-3'), null);

  const transport = await bus.get({ event_id: 'evt-bad' });
  assert.equal(transport.status, EVENT_STATUSES.DEAD);
  assert.equal(transport.last_error.message, 'OPEN_LOOP_EVENT_CONVERSATION_REQUIRED');
});

test('event-bus idempotency prevents duplicate open-loop application', async () => {
  const now = 5_000;
  const bus = createInMemoryEventBusAdapter();
  const store = new MemoryOpenLoopStore();
  const openLoops = new OpenLoopService(store, { now: () => now, id: () => 'lease-open-loop' });
  const bridge = new OpenLoopEventBridge({ eventBus: bus, openLoops, now: () => now });

  const first = await bus.publish(event({
    id: 'evt-once',
    topic: 'work.resumable',
    key: 'same-work-transition',
    payload: {
      taskId: 'task-4',
      conversationId: 'conv-4',
      resumeAt: now,
      checkpoint: { pass: 1 },
    },
    createdAt: now,
  }));
  const duplicate = await bus.publish(event({
    id: 'evt-duplicate-id',
    topic: 'work.resumable',
    key: 'same-work-transition',
    payload: {
      taskId: 'task-4',
      conversationId: 'conv-4',
      resumeAt: now,
      checkpoint: { pass: 999 },
    },
    createdAt: now,
  }));

  assert.equal(first.deduplicated, false);
  assert.equal(duplicate.deduplicated, true);

  const firstDrain = await bridge.consumeTopic({ topic: 'work.resumable' });
  const secondDrain = await bridge.consumeTopic({ topic: 'work.resumable' });
  assert.equal(firstDrain.length, 1);
  assert.equal(secondDrain.length, 0);

  const loop = await store.get('conv-4::task-4');
  assert.deepEqual(loop.checkpoint, { pass: 1 });
});
