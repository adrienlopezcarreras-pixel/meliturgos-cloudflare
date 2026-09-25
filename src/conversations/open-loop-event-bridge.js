const SUPPORTED_TYPES = new Set([
  'task.completed', 'work.completed', 'job.completed',
  'task.cancelled', 'work.cancelled', 'job.cancelled',
  'task.failed', 'work.failed', 'job.failed',
  'task.paused', 'work.paused', 'task.waiting', 'work.waiting',
  'task.resumable', 'work.resumable', 'followup.due', 'checkpoint.ready',
]);

function asText(value) {
  return String(value ?? '').trim();
}

function asPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function deliveryParts(input = {}) {
  const event = input?.event;
  const delivery = input?.delivery;
  if (!event || typeof event !== 'object') throw new Error('OPEN_LOOP_EVENT_REQUIRED');
  if (!delivery || typeof delivery !== 'object') throw new Error('OPEN_LOOP_DELIVERY_REQUIRED');

  const eventId = asText(event.event_id);
  const topic = asText(event.topic).toLowerCase();
  const consumer = asText(delivery.consumer);
  const leaseToken = asText(delivery.lease_token);

  if (!eventId) throw new Error('OPEN_LOOP_EVENT_ID_REQUIRED');
  if (!SUPPORTED_TYPES.has(topic)) throw new Error('OPEN_LOOP_EVENT_TOPIC_UNSUPPORTED');
  if (!consumer) throw new Error('OPEN_LOOP_EVENT_CONSUMER_REQUIRED');
  if (!leaseToken) throw new Error('OPEN_LOOP_EVENT_LEASE_REQUIRED');

  return { event, delivery, eventId, topic, consumer, leaseToken };
}

function mappedPayload(event, topic) {
  const payload = event?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('OPEN_LOOP_EVENT_PAYLOAD_INVALID');
  }

  const taskId = asText(payload.taskId ?? payload.task_id);
  const conversationId = asText(payload.conversationId ?? payload.conversation_id);
  if (!taskId) throw new Error('OPEN_LOOP_EVENT_TASK_REQUIRED');
  if (!conversationId) throw new Error('OPEN_LOOP_EVENT_CONVERSATION_REQUIRED');

  return {
    taskId,
    conversationId,
    owner: asText(payload.owner),
    payload: {
      eventId: asText(event.event_id),
      retryable: payload.retryable,
      nextAction: payload.nextAction ?? payload.next_action,
      resumeAt: payload.resumeAt ?? payload.resume_at,
      checkpoint: payload.checkpoint,
      metadata: {
        ...(payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
          ? payload.metadata
          : {}),
        event_bus_topic: topic,
        event_bus_source: asText(event.source),
        event_bus_correlation_id: asText(event.correlation_id),
        event_bus_causation_id: asText(event.causation_id),
      },
    },
  };
}

/**
 * Bridges durable Event Bus deliveries into OpenLoopService without letting
 * transport semantics leak into the open-loop domain.
 *
 * This bridge deliberately consumes one explicit topic at a time. A caller
 * must choose the topic so this consumer never leases unrelated events.
 */
export class OpenLoopEventBridge {
  constructor({ eventBus, openLoops, now = () => Date.now() } = {}) {
    if (!eventBus || typeof eventBus.pull !== 'function' || typeof eventBus.ack !== 'function' || typeof eventBus.fail !== 'function') {
      throw new Error('OPEN_LOOP_EVENT_BUS_REQUIRED');
    }
    if (!openLoops || typeof openLoops.recordEvent !== 'function') {
      throw new Error('OPEN_LOOP_SERVICE_REQUIRED');
    }
    this.eventBus = eventBus;
    this.openLoops = openLoops;
    this.now = now;
  }

  async handle(delivery, {
    maxAttempts = 3,
    retryDelayMs = 60_000,
  } = {}) {
    const parts = deliveryParts(delivery);
    const at = this.now();

    try {
      const mapped = mappedPayload(parts.event, parts.topic);
      const loop = await this.openLoops.recordEvent({
        type: parts.topic,
        taskId: mapped.taskId,
        conversationId: mapped.conversationId,
        owner: mapped.owner,
        payload: mapped.payload,
        at,
      });

      await this.eventBus.ack({
        event_id: parts.eventId,
        consumer: parts.consumer,
        lease_token: parts.leaseToken,
        acknowledged_at: at,
      });

      return {
        ok: true,
        event_id: parts.eventId,
        topic: parts.topic,
        loop,
      };
    } catch (error) {
      const delay = asPositiveInt(retryDelayMs, 60_000, 86_400_000);
      const attempts = asPositiveInt(maxAttempts, 3, 100);
      await this.eventBus.fail({
        event_id: parts.eventId,
        consumer: parts.consumer,
        lease_token: parts.leaseToken,
        error: asText(error?.message || error) || 'OPEN_LOOP_EVENT_FAILED',
        failed_at: at,
        retry_at: at + delay,
        max_attempts: attempts,
      });

      return {
        ok: false,
        event_id: parts.eventId,
        topic: parts.topic,
        error: asText(error?.message || error) || 'OPEN_LOOP_EVENT_FAILED',
      };
    }
  }

  async consumeTopic({
    topic,
    consumer = 'mel.open-loops',
    now = this.now(),
    limit = 10,
    leaseMs = 30_000,
    maxAttempts = 3,
    retryDelayMs = 60_000,
  } = {}) {
    const normalizedTopic = asText(topic).toLowerCase();
    if (!SUPPORTED_TYPES.has(normalizedTopic)) throw new Error('OPEN_LOOP_EVENT_TOPIC_UNSUPPORTED');

    const deliveries = await this.eventBus.pull({
      consumer: asText(consumer) || 'mel.open-loops',
      topic: normalizedTopic,
      now,
      limit: asPositiveInt(limit, 10, 100),
      lease_ms: asPositiveInt(leaseMs, 30_000, 3_600_000),
    });

    const outcomes = [];
    for (const delivery of deliveries) {
      outcomes.push(await this.handle(delivery, { maxAttempts, retryDelayMs }));
    }
    return outcomes;
  }
}

export const OPEN_LOOP_EVENT_TYPES = Object.freeze([...SUPPORTED_TYPES]);
