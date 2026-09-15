import { port, requireValue } from '../core/contracts.js';

export const EVENT_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  LEASED: 'LEASED',
  ACKED: 'ACKED',
  DEAD: 'DEAD',
});

export const methods = Object.freeze([
  'publish',
  'schedule',
  'pull',
  'ack',
  'fail',
  'get',
  'list',
]);

export const createEventBus = adapters => port('event_bus', methods, adapters);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => structuredClone(value);

function optionalTrimmed(value, code) {
  requireValue(value === undefined || value === null || nonEmptyString(value), code, 400);
  return value === undefined || value === null ? undefined : value.trim();
}

/**
 * Canonical immutable event envelope used by GEN2-40.
 * Delivery state is deliberately kept outside the event so transports can
 * persist/replay the same event without mutating its business payload.
 */
export function eventEnvelope(record = {}) {
  requireValue(isRecord(record), 'EVENT_INVALID', 400);
  requireValue(nonEmptyString(record.event_id), 'EVENT_ID_INVALID', 400);
  requireValue(nonEmptyString(record.topic), 'EVENT_TOPIC_INVALID', 400);
  requireValue(nonEmptyString(record.source), 'EVENT_SOURCE_INVALID', 400);
  requireValue(nonEmptyString(record.idempotency_key), 'EVENT_IDEMPOTENCY_KEY_INVALID', 400);
  requireValue(isRecord(record.payload), 'EVENT_PAYLOAD_INVALID', 400);
  requireValue(Number.isFinite(record.created_at), 'EVENT_CREATED_AT_INVALID', 400);
  requireValue(record.metadata === undefined || isRecord(record.metadata), 'EVENT_METADATA_INVALID', 400);

  const correlationId = optionalTrimmed(record.correlation_id, 'EVENT_CORRELATION_ID_INVALID');
  const causationId = optionalTrimmed(record.causation_id, 'EVENT_CAUSATION_ID_INVALID');

  return clone({
    event_id: record.event_id.trim(),
    topic: record.topic.trim(),
    source: record.source.trim(),
    idempotency_key: record.idempotency_key.trim(),
    payload: record.payload,
    created_at: record.created_at,
    ...(correlationId === undefined ? {} : { correlation_id: correlationId }),
    ...(causationId === undefined ? {} : { causation_id: causationId }),
    metadata: record.metadata ?? {},
  });
}

/** Follow-up messages use the same immutable event envelope and a due date. */
export function scheduledEvent(input = {}) {
  requireValue(isRecord(input), 'EVENT_SCHEDULE_INVALID', 400);
  const event = eventEnvelope(input.event ?? input);
  const availableAt = input.available_at ?? input.availableAt;
  requireValue(Number.isFinite(availableAt), 'EVENT_AVAILABLE_AT_INVALID', 400);
  requireValue(availableAt >= event.created_at, 'EVENT_AVAILABLE_AT_BEFORE_CREATED', 400);
  return { event, available_at: availableAt };
}

export function pullRequest(input = {}) {
  requireValue(isRecord(input), 'EVENT_PULL_INVALID', 400);
  requireValue(nonEmptyString(input.consumer), 'EVENT_CONSUMER_INVALID', 400);
  requireValue(input.topic === undefined || nonEmptyString(input.topic), 'EVENT_PULL_TOPIC_INVALID', 400);
  requireValue(Number.isFinite(input.now), 'EVENT_PULL_NOW_INVALID', 400);
  const limit = input.limit ?? 10;
  const leaseMs = input.lease_ms ?? input.leaseMs ?? 30_000;
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'EVENT_PULL_LIMIT_INVALID', 400);
  requireValue(Number.isInteger(leaseMs) && leaseMs > 0 && leaseMs <= 3_600_000, 'EVENT_LEASE_MS_INVALID', 400);
  return {
    consumer: input.consumer.trim(),
    ...(input.topic === undefined ? {} : { topic: input.topic.trim() }),
    now: input.now,
    limit,
    lease_ms: leaseMs,
  };
}

function deliveryAction(input = {}, action) {
  requireValue(isRecord(input), `EVENT_${action}_INVALID`, 400);
  requireValue(nonEmptyString(input.event_id), 'EVENT_ID_INVALID', 400);
  requireValue(nonEmptyString(input.consumer), 'EVENT_CONSUMER_INVALID', 400);
  requireValue(nonEmptyString(input.lease_token), 'EVENT_LEASE_TOKEN_INVALID', 400);
  return {
    event_id: input.event_id.trim(),
    consumer: input.consumer.trim(),
    lease_token: input.lease_token.trim(),
  };
}

export function ackRequest(input = {}) {
  const base = deliveryAction(input, 'ACK');
  requireValue(Number.isFinite(input.acknowledged_at), 'EVENT_ACK_TIME_INVALID', 400);
  return { ...base, acknowledged_at: input.acknowledged_at };
}

export function failRequest(input = {}) {
  const base = deliveryAction(input, 'FAIL');
  requireValue(nonEmptyString(input.error), 'EVENT_FAILURE_ERROR_INVALID', 400);
  requireValue(Number.isFinite(input.failed_at), 'EVENT_FAILURE_TIME_INVALID', 400);
  const maxAttempts = input.max_attempts ?? input.maxAttempts ?? 3;
  requireValue(Number.isInteger(maxAttempts) && maxAttempts > 0 && maxAttempts <= 100, 'EVENT_MAX_ATTEMPTS_INVALID', 400);
  requireValue(input.retry_at === undefined || Number.isFinite(input.retry_at), 'EVENT_RETRY_AT_INVALID', 400);
  requireValue(input.retry_at === undefined || input.retry_at >= input.failed_at, 'EVENT_RETRY_AT_BEFORE_FAILURE', 400);
  return {
    ...base,
    error: input.error.trim(),
    failed_at: input.failed_at,
    max_attempts: maxAttempts,
    ...(input.retry_at === undefined ? {} : { retry_at: input.retry_at }),
  };
}

export function listRequest(input = {}) {
  requireValue(isRecord(input), 'EVENT_LIST_INVALID', 400);
  requireValue(input.topic === undefined || nonEmptyString(input.topic), 'EVENT_LIST_TOPIC_INVALID', 400);
  requireValue(input.status === undefined || Object.values(EVENT_STATUSES).includes(input.status), 'EVENT_LIST_STATUS_INVALID', 400);
  const limit = input.limit ?? 100;
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'EVENT_LIST_LIMIT_INVALID', 400);
  return {
    ...(input.topic === undefined ? {} : { topic: input.topic.trim() }),
    ...(input.status === undefined ? {} : { status: input.status }),
    limit,
  };
}

export function eventIdRequest(input = {}) {
  requireValue(isRecord(input) && nonEmptyString(input.event_id), 'EVENT_ID_INVALID', 400);
  return input.event_id.trim();
}

/**
 * Reference adapter defining durable semantics before a D1/Queue backend is
 * introduced: exactly-once admission per idempotency key, at-least-once
 * delivery with leases, retry/dead-letter state, deterministic reads and
 * defensive copies on every boundary.
 */
export function createInMemoryEventBusAdapter(seed = []) {
  requireValue(Array.isArray(seed), 'EVENT_SEED_INVALID', 400);

  const records = new Map();
  const idempotencyIndex = new Map();
  let sequence = 0;

  const snapshot = record => clone({
    event: record.event,
    status: record.status,
    available_at: record.available_at,
    attempts: record.attempts,
    ...(record.consumer ? { consumer: record.consumer } : {}),
    ...(record.lease_token ? { lease_token: record.lease_token } : {}),
    ...(record.lease_until !== undefined ? { lease_until: record.lease_until } : {}),
    ...(record.acknowledged_at !== undefined ? { acknowledged_at: record.acknowledged_at } : {}),
    ...(record.last_error ? { last_error: record.last_error } : {}),
  });

  const admit = (event, availableAt) => {
    const duplicateId = idempotencyIndex.get(event.idempotency_key);
    if (duplicateId) {
      const existing = records.get(duplicateId);
      requireValue(existing, 'EVENT_IDEMPOTENCY_INDEX_CORRUPT', 500);
      return { record: existing, deduplicated: true };
    }

    requireValue(!records.has(event.event_id), 'EVENT_ID_EXISTS', 409);
    const record = {
      event,
      status: EVENT_STATUSES.PENDING,
      available_at: availableAt,
      attempts: 0,
      sequence: sequence++,
    };
    records.set(event.event_id, record);
    idempotencyIndex.set(event.idempotency_key, event.event_id);
    return { record, deduplicated: false };
  };

  for (const candidate of seed) {
    const scheduled = scheduledEvent(candidate);
    const admitted = admit(scheduled.event, scheduled.available_at);
    requireValue(!admitted.deduplicated, 'EVENT_SEED_DUPLICATE_IDEMPOTENCY', 409);
  }

  const requireRecord = eventId => {
    const record = records.get(eventId);
    requireValue(record, 'EVENT_NOT_FOUND', 404);
    return record;
  };

  const requireLease = (record, input) => {
    requireValue(record.status === EVENT_STATUSES.LEASED, 'EVENT_NOT_LEASED', 409);
    requireValue(record.consumer === input.consumer, 'EVENT_LEASE_CONSUMER_MISMATCH', 409);
    requireValue(record.lease_token === input.lease_token, 'EVENT_LEASE_TOKEN_MISMATCH', 409);
  };

  return Object.freeze({
    async publish(input) {
      const event = eventEnvelope(input);
      const admitted = admit(event, event.created_at);
      return { event: clone(admitted.record.event), deduplicated: admitted.deduplicated };
    },

    async schedule(input) {
      const scheduled = scheduledEvent(input);
      const admitted = admit(scheduled.event, scheduled.available_at);
      return {
        event: clone(admitted.record.event),
        available_at: admitted.record.available_at,
        deduplicated: admitted.deduplicated,
      };
    },

    async pull(input) {
      const query = pullRequest(input);
      const due = [...records.values()]
        .filter(record => record.status === EVENT_STATUSES.PENDING
          || (record.status === EVENT_STATUSES.LEASED && record.lease_until <= query.now))
        .filter(record => record.available_at <= query.now)
        .filter(record => query.topic === undefined || record.event.topic === query.topic)
        .sort((a, b) => a.available_at - b.available_at || a.sequence - b.sequence)
        .slice(0, query.limit);

      return due.map(record => {
        record.status = EVENT_STATUSES.LEASED;
        record.attempts += 1;
        record.consumer = query.consumer;
        record.lease_until = query.now + query.lease_ms;
        record.lease_token = `${record.event.event_id}:${query.consumer}:${record.attempts}`;
        return clone({
          event: record.event,
          delivery: {
            consumer: record.consumer,
            lease_token: record.lease_token,
            lease_until: record.lease_until,
            attempt: record.attempts,
          },
        });
      });
    },

    async ack(input) {
      const request = ackRequest(input);
      const record = requireRecord(request.event_id);

      if (record.status === EVENT_STATUSES.ACKED) {
        requireValue(record.consumer === request.consumer, 'EVENT_ACK_CONSUMER_MISMATCH', 409);
        requireValue(record.lease_token === request.lease_token, 'EVENT_ACK_TOKEN_MISMATCH', 409);
        return snapshot(record);
      }

      requireLease(record, request);
      record.status = EVENT_STATUSES.ACKED;
      record.acknowledged_at = request.acknowledged_at;
      delete record.lease_until;
      return snapshot(record);
    },

    async fail(input) {
      const request = failRequest(input);
      const record = requireRecord(request.event_id);
      requireLease(record, request);
      record.last_error = {
        message: request.error,
        failed_at: request.failed_at,
        attempt: record.attempts,
      };
      delete record.lease_until;

      if (record.attempts >= request.max_attempts) {
        record.status = EVENT_STATUSES.DEAD;
      } else {
        record.status = EVENT_STATUSES.PENDING;
        record.available_at = request.retry_at ?? request.failed_at;
        delete record.consumer;
        delete record.lease_token;
      }
      return snapshot(record);
    },

    async get(input) {
      const record = requireRecord(eventIdRequest(input));
      return snapshot(record);
    },

    async list(input = {}) {
      const query = listRequest(input);
      return [...records.values()]
        .filter(record => query.topic === undefined || record.event.topic === query.topic)
        .filter(record => query.status === undefined || record.status === query.status)
        .sort((a, b) => a.sequence - b.sequence)
        .slice(0, query.limit)
        .map(snapshot);
    },
  });
}
