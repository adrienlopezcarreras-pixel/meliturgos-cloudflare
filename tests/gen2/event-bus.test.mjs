import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_STATUSES,
  ackRequest,
  createEventBus,
  createInMemoryEventBusAdapter,
  eventEnvelope,
  failRequest,
  listRequest,
  pullRequest,
  scheduledEvent,
} from '../../src/events/event-bus.js';

const event = (event_id, created_at = 1_000, overrides = {}) => ({
  event_id,
  topic: 'work.completed',
  source: 'work-engine',
  idempotency_key: `idem:${event_id}`,
  payload: { task_id: `task:${event_id}` },
  created_at,
  correlation_id: 'corr-1',
  metadata: { owner: 'mel' },
  ...overrides,
});

test('event envelope is canonical, defensive and fail-closed', () => {
  const input = event(' evt-1 ', 1_000, {
    topic: ' work.completed ',
    source: ' work-engine ',
    idempotency_key: ' idem:evt-1 ',
  });
  const normalized = eventEnvelope(input);

  assert.equal(normalized.event_id, 'evt-1');
  assert.equal(normalized.topic, 'work.completed');
  assert.equal(normalized.source, 'work-engine');
  assert.equal(normalized.idempotency_key, 'idem:evt-1');
  assert.notEqual(normalized.payload, input.payload);
  assert.notEqual(normalized.metadata, input.metadata);

  input.payload.task_id = 'mutated';
  assert.equal(normalized.payload.task_id, 'task: evt-1 ');
  assert.throws(() => eventEnvelope({ ...event('bad'), payload: [] }), { code: 'EVENT_PAYLOAD_INVALID' });
  assert.throws(() => eventEnvelope({ ...event('bad'), idempotency_key: ' ' }), { code: 'EVENT_IDEMPOTENCY_KEY_INVALID' });
});

test('event bus port stays fail-closed when no adapter is wired', async () => {
  const bus = createEventBus();
  await assert.rejects(() => bus.publish(event('evt-1')), { code: 'NOT_IMPLEMENTED:event_bus.publish' });
});

test('publish admits an idempotency key exactly once', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const first = await bus.publish(event('evt-1'));
  const duplicate = await bus.publish(event('evt-2', 2_000, {
    idempotency_key: 'idem:evt-1',
    payload: { task_id: 'different' },
  }));

  assert.equal(first.deduplicated, false);
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.event.event_id, 'evt-1');
  assert.equal((await bus.list()).length, 1);
  await assert.rejects(
    () => bus.publish(event('evt-1', 3_000, { idempotency_key: 'idem:different' })),
    { code: 'EVENT_ID_EXISTS', status: 409 },
  );
});

test('scheduled follow-ups become visible only when due', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const scheduled = await bus.schedule({
    event: event('follow-1', 1_000, { topic: 'followup.due' }),
    available_at: 5_000,
  });

  assert.equal(scheduled.available_at, 5_000);
  assert.deepEqual(await bus.pull({ consumer: 'worker-a', topic: 'followup.due', now: 4_999 }), []);

  const due = await bus.pull({ consumer: 'worker-a', topic: 'followup.due', now: 5_000, lease_ms: 500 });
  assert.equal(due.length, 1);
  assert.equal(due[0].event.event_id, 'follow-1');
  assert.equal(due[0].delivery.attempt, 1);
  assert.equal(due[0].delivery.lease_until, 5_500);
});

test('leases provide at-least-once delivery and idempotent acknowledgement', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  await bus.publish(event('evt-lease'));

  const [first] = await bus.pull({ consumer: 'worker-a', now: 1_000, lease_ms: 100 });
  assert.equal((await bus.pull({ consumer: 'worker-b', now: 1_050 })).length, 0);

  const [redelivery] = await bus.pull({ consumer: 'worker-b', now: 1_101, lease_ms: 100 });
  assert.equal(redelivery.event.event_id, 'evt-lease');
  assert.equal(redelivery.delivery.attempt, 2);
  assert.notEqual(redelivery.delivery.lease_token, first.delivery.lease_token);

  await assert.rejects(
    () => bus.ack({
      event_id: 'evt-lease',
      consumer: 'worker-a',
      lease_token: first.delivery.lease_token,
      acknowledged_at: 1_110,
    }),
    { code: 'EVENT_LEASE_CONSUMER_MISMATCH', status: 409 },
  );

  const ackInput = {
    event_id: 'evt-lease',
    consumer: 'worker-b',
    lease_token: redelivery.delivery.lease_token,
    acknowledged_at: 1_120,
  };
  const acked = await bus.ack(ackInput);
  assert.equal(acked.status, EVENT_STATUSES.ACKED);
  assert.equal((await bus.ack(ackInput)).status, EVENT_STATUSES.ACKED);
  assert.equal((await bus.pull({ consumer: 'worker-c', now: 10_000 })).length, 0);
});

test('failed deliveries retry and eventually enter dead-letter state', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  await bus.publish(event('evt-fail'));

  const [attempt1] = await bus.pull({ consumer: 'worker-a', now: 1_000 });
  const retry = await bus.fail({
    event_id: 'evt-fail',
    consumer: 'worker-a',
    lease_token: attempt1.delivery.lease_token,
    error: 'temporary outage',
    failed_at: 1_010,
    retry_at: 2_000,
    max_attempts: 2,
  });
  assert.equal(retry.status, EVENT_STATUSES.PENDING);
  assert.equal(retry.available_at, 2_000);
  assert.equal((await bus.pull({ consumer: 'worker-b', now: 1_999 })).length, 0);

  const [attempt2] = await bus.pull({ consumer: 'worker-b', now: 2_000 });
  const dead = await bus.fail({
    event_id: 'evt-fail',
    consumer: 'worker-b',
    lease_token: attempt2.delivery.lease_token,
    error: 'still unavailable',
    failed_at: 2_010,
    max_attempts: 2,
  });
  assert.equal(dead.status, EVENT_STATUSES.DEAD);
  assert.equal(dead.attempts, 2);
  assert.equal(dead.last_error.message, 'still unavailable');
  assert.equal((await bus.pull({ consumer: 'worker-c', now: 9_999 })).length, 0);
});

test('read models are deterministic, filterable and defensive', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  await bus.publish(event('evt-a', 1_000, { topic: 'alpha' }));
  await bus.publish(event('evt-b', 1_100, { topic: 'beta' }));

  const alpha = await bus.list({ topic: 'alpha' });
  assert.deepEqual(alpha.map(row => row.event.event_id), ['evt-a']);
  alpha[0].event.payload.task_id = 'outside-change';
  assert.equal((await bus.get({ event_id: 'evt-a' })).event.payload.task_id, 'task:evt-a');

  const leased = await bus.pull({ consumer: 'worker-a', topic: 'beta', now: 1_100 });
  assert.equal(leased.length, 1);
  assert.deepEqual(
    (await bus.list({ status: EVENT_STATUSES.LEASED })).map(row => row.event.event_id),
    ['evt-b'],
  );
});

test('request validators reject unsafe ranges and malformed delivery actions', () => {
  assert.deepEqual(pullRequest({ consumer: 'worker-a', now: 10 }), {
    consumer: 'worker-a',
    now: 10,
    limit: 10,
    lease_ms: 30_000,
  });
  assert.throws(() => pullRequest({ consumer: 'worker-a', now: 10, limit: 0 }), { code: 'EVENT_PULL_LIMIT_INVALID' });
  assert.throws(() => scheduledEvent({ event: event('bad'), available_at: 999 }), { code: 'EVENT_AVAILABLE_AT_BEFORE_CREATED' });
  assert.throws(() => ackRequest({ event_id: 'x', consumer: 'c', lease_token: 't' }), { code: 'EVENT_ACK_TIME_INVALID' });
  assert.throws(() => failRequest({
    event_id: 'x', consumer: 'c', lease_token: 't', error: 'x', failed_at: 10, retry_at: 9,
  }), { code: 'EVENT_RETRY_AT_BEFORE_FAILURE' });
  assert.throws(() => listRequest({ status: 'UNKNOWN' }), { code: 'EVENT_LIST_STATUS_INVALID' });
});
