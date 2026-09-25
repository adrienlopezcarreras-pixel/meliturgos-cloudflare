const SUPPORTED_TOPICS = new Set([
  'work.created',
  'work.running',
  'work.waiting',
  'work.resumable',
  'work.completed',
  'work.failed',
  'work.cancelled',
  'project.created',
  'project.status',
  'decision.recorded',
  'decision.status',
  'lesson.added',
]);

function asText(value) {
  return String(value ?? '').trim();
}

function asTime(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function selectedMetadata(event, payload) {
  const keys = [
    'owner',
    'conversation_id',
    'conversationId',
    'work_dag_id',
    'workDagId',
    'job_id',
    'jobId',
    'project_id',
    'projectId',
    'decision_id',
    'decisionId',
    'lesson_id',
    'lessonId',
    'status',
  ];
  const metadata = {
    event_bus_event_id: asText(event.event_id),
    event_bus_topic: asText(event.topic),
    event_bus_source: asText(event.source),
  };
  if (event.correlation_id) metadata.event_bus_correlation_id = asText(event.correlation_id);
  if (event.causation_id) metadata.event_bus_causation_id = asText(event.causation_id);

  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && asText(value)) metadata[key] = asText(value);
  }
  return metadata;
}

function titleFor(topic, payload) {
  const explicit = asText(payload?.title);
  if (explicit) return explicit;

  const projectId = asText(payload?.project_id ?? payload?.projectId);
  const decisionId = asText(payload?.decision_id ?? payload?.decisionId);
  const lessonId = asText(payload?.lesson_id ?? payload?.lessonId);
  const workId = asText(payload?.work_dag_id ?? payload?.workDagId ?? payload?.job_id ?? payload?.jobId);
  const status = asText(payload?.status);

  if (topic.startsWith('project.')) return projectId ? `Project ${projectId}: ${status || topic.split('.')[1]}` : topic;
  if (topic.startsWith('decision.')) return decisionId ? `Decision ${decisionId}: ${status || topic.split('.')[1]}` : topic;
  if (topic === 'lesson.added') return lessonId ? `Lesson ${lessonId} added` : 'Lesson added';
  if (topic.startsWith('work.')) return workId ? `Work ${workId}: ${topic.split('.')[1]}` : topic;
  return topic;
}

function descriptionFor(topic, payload) {
  const candidates = [
    payload?.description,
    payload?.rationale,
    payload?.content,
    payload?.next_action,
    payload?.nextAction,
    payload?.reason,
  ];
  for (const value of candidates) {
    const text = asText(value);
    if (text) return text.slice(0, 6000);
  }
  const status = asText(payload?.status);
  return status ? `${topic} -> ${status}` : topic;
}

function occurredAt(event, payload) {
  for (const value of [
    payload?.occurred_at,
    payload?.occurredAt,
    payload?.changed_at,
    payload?.changedAt,
    payload?.decided_at,
    payload?.decidedAt,
    payload?.learned_at,
    payload?.learnedAt,
    payload?.updated_at,
    payload?.updatedAt,
  ]) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return asTime(event.created_at, Date.now());
}

export function timelineEventFromBus(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('TIMELINE_PROJECTOR_EVENT_REQUIRED');
  }
  const topic = asText(event.topic).toLowerCase();
  if (!SUPPORTED_TOPICS.has(topic)) throw new Error('TIMELINE_PROJECTOR_TOPIC_UNSUPPORTED');
  if (!asText(event.event_id)) throw new Error('TIMELINE_PROJECTOR_EVENT_ID_REQUIRED');
  if (!asText(event.source)) throw new Error('TIMELINE_PROJECTOR_SOURCE_REQUIRED');
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    throw new Error('TIMELINE_PROJECTOR_PAYLOAD_INVALID');
  }

  const confidence = Number(event.payload.confidence);
  return {
    event_id: `bus:${asText(event.event_id)}`,
    type: topic,
    title: titleFor(topic, event.payload),
    description: descriptionFor(topic, event.payload),
    occurred_at: occurredAt(event, event.payload),
    source: asText(event.source),
    confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 1,
    metadata: selectedMetadata(event, event.payload),
  };
}

/**
 * Projects selected immutable Event Bus facts into the personal Timeline.
 * Duplicate projection is safe: an existing deterministic Timeline id is
 * treated as success and the transport event is acknowledged.
 */
export class EventTimelineProjector {
  constructor({ eventBus, timeline, now = () => Date.now() } = {}) {
    if (!eventBus || typeof eventBus.pull !== 'function' || typeof eventBus.ack !== 'function' || typeof eventBus.fail !== 'function') {
      throw new Error('TIMELINE_PROJECTOR_EVENT_BUS_REQUIRED');
    }
    if (!timeline || typeof timeline.append !== 'function' || typeof timeline.get !== 'function') {
      throw new Error('TIMELINE_PROJECTOR_TIMELINE_REQUIRED');
    }
    this.eventBus = eventBus;
    this.timeline = timeline;
    this.now = now;
  }

  async projectDelivery(delivery, { maxAttempts = 3, retryDelayMs = 60_000 } = {}) {
    const event = delivery?.event;
    const transport = delivery?.delivery;
    if (!event || !transport) throw new Error('TIMELINE_PROJECTOR_DELIVERY_REQUIRED');

    const consumer = asText(transport.consumer);
    const leaseToken = asText(transport.lease_token);
    if (!consumer || !leaseToken) throw new Error('TIMELINE_PROJECTOR_LEASE_REQUIRED');

    const at = this.now();
    try {
      const projected = timelineEventFromBus(event);
      let timelineEvent;
      try {
        timelineEvent = await this.timeline.append(projected);
      } catch (error) {
        if (error?.code !== 'TIMELINE_EVENT_EXISTS') throw error;
        timelineEvent = await this.timeline.get({ event_id: projected.event_id });
      }

      await this.eventBus.ack({
        event_id: event.event_id,
        consumer,
        lease_token: leaseToken,
        acknowledged_at: at,
      });

      return {
        ok: true,
        event_id: event.event_id,
        timeline_event_id: timelineEvent.event_id,
        deduplicated: timelineEvent.event_id === projected.event_id,
      };
    } catch (error) {
      const attempts = Math.max(1, Math.min(100, Math.trunc(Number(maxAttempts) || 3)));
      const delay = Math.max(1_000, Math.min(86_400_000, Math.trunc(Number(retryDelayMs) || 60_000)));

      await this.eventBus.fail({
        event_id: event.event_id,
        consumer,
        lease_token: leaseToken,
        error: asText(error?.code || error?.message || error) || 'TIMELINE_PROJECTOR_FAILED',
        failed_at: at,
        retry_at: at + delay,
        max_attempts: attempts,
      });

      return {
        ok: false,
        event_id: event.event_id,
        error: asText(error?.code || error?.message || error) || 'TIMELINE_PROJECTOR_FAILED',
      };
    }
  }

  async consumeTopic({
    topic,
    consumer = 'mel.timeline-projector',
    now = this.now(),
    limit = 20,
    leaseMs = 30_000,
    maxAttempts = 3,
    retryDelayMs = 60_000,
  } = {}) {
    const normalizedTopic = asText(topic).toLowerCase();
    if (!SUPPORTED_TOPICS.has(normalizedTopic)) throw new Error('TIMELINE_PROJECTOR_TOPIC_UNSUPPORTED');

    const deliveries = await this.eventBus.pull({
      topic: normalizedTopic,
      consumer: asText(consumer) || 'mel.timeline-projector',
      now,
      limit: Math.max(1, Math.min(100, Math.trunc(Number(limit) || 20))),
      lease_ms: Math.max(1_000, Math.min(3_600_000, Math.trunc(Number(leaseMs) || 30_000))),
    });

    const outcomes = [];
    for (const delivery of deliveries) {
      outcomes.push(await this.projectDelivery(delivery, { maxAttempts, retryDelayMs }));
    }
    return outcomes;
  }
}

export const TIMELINE_PROJECTOR_TOPICS = Object.freeze([...SUPPORTED_TOPICS]);
