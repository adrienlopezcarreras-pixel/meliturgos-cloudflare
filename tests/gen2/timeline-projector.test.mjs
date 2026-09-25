import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEventBus,
  createInMemoryEventBusAdapter,
  EVENT_STATUSES,
} from '../../src/events/event-bus.js';
import {
  createInMemoryTimelineAdapter,
  createTimeline,
} from '../../src/memory/timeline.js';
import {
  EventTimelineProjector,
  TIMELINE_PROJECTOR_TOPICS,
  timelineEventFromBus,
} from '../../src/events/timeline-projector.js';

function event(id, topic, payload = {}, createdAt = 1_000) {
  return {
    event_id: id,
    topic,
    source: 'mel-core',
    idempotency_key: `idem:${id}`,
    payload,
    created_at: createdAt,
    metadata: {},
  };
}

test('timeline projector maps Work, Project, Decision and Lesson events canonically', () => {
  for (const topic of ['work.completed', 'project.status', 'decision.recorded', 'lesson.added']) {
    assert.ok(TIMELINE_PROJECTOR_TOPICS.includes(topic));
  }

  const projected = timelineEventFromBus(event('evt-project', 'project.status', {
    project_id: 'p1',
    status: 'ACTIVE',
    changed_at: 2_000,
    reason: 'started',
    confidence: 0.9,
  }));

  assert.equal(projected.event_id, 'bus:evt-project');
  assert.equal(projected.type, 'project.status');
  assert.equal(projected.title, 'Project p1: ACTIVE');
  assert.equal(projected.description, 'started');
  assert.equal(projected.occurred_at, 2_000);
  assert.equal(projected.confidence, 0.9);
  assert.equal(projected.metadata.project_id, 'p1');
  assert.equal(projected.metadata.status, 'ACTIVE');
});

test('projector consumes a due event, appends Timeline fact and ACKs transport', async () => {
  let now = 5_000;
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const timeline = createTimeline(createInMemoryTimelineAdapter());
  const projector = new EventTimelineProjector({ eventBus: bus, timeline, now: () => now });

  await bus.publish(event('evt-work', 'work.completed', {
    work_dag_id: 'work-42',
    conversation_id: 'conv-1',
    description: 'Persistent work completed',
    occurred_at: 4_900,
  }, 4_800));

  const results = await projector.consumeTopic({ topic: 'work.completed' });
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);

  const timelineRow = await timeline.get({ event_id: 'bus:evt-work' });
  assert.equal(timelineRow.type, 'work.completed');
  assert.equal(timelineRow.title, 'Work work-42: completed');
  assert.equal(timelineRow.occurred_at, 4_900);
  assert.equal(timelineRow.metadata.conversation_id, 'conv-1');

  const transport = await bus.get({ event_id: 'evt-work' });
  assert.equal(transport.status, EVENT_STATUSES.ACKED);
});

test('existing deterministic Timeline projection is treated idempotently and ACKed', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const eventRow = event('evt-dup', 'decision.recorded', {
    decision_id: 'd1',
    project_id: 'p1',
    title: 'Adopt durable state',
    rationale: 'Needed after restart',
    decided_at: 2_000,
  }, 1_900);
  const existing = timelineEventFromBus(eventRow);
  const timeline = createTimeline(createInMemoryTimelineAdapter([existing]));
  const projector = new EventTimelineProjector({ eventBus: bus, timeline, now: () => 3_000 });

  await bus.publish(eventRow);
  const results = await projector.consumeTopic({ topic: 'decision.recorded' });
  assert.equal(results[0].ok, true);

  const rows = await timeline.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_id, 'bus:evt-dup');
  assert.equal((await bus.get({ event_id: 'evt-dup' })).status, EVENT_STATUSES.ACKED);
});

test('Timeline failure follows Event Bus retry/dead-letter semantics', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const timeline = {
    append: async () => {
      const error = new Error('TIMELINE_STORAGE_DOWN');
      error.code = 'TIMELINE_STORAGE_DOWN';
      throw error;
    },
    get: async () => null,
  };
  const projector = new EventTimelineProjector({ eventBus: bus, timeline, now: () => 4_000 });

  await bus.publish(event('evt-fail', 'lesson.added', {
    lesson_id: 'l1',
    project_id: 'p1',
    content: 'Never invent state',
    learned_at: 3_900,
  }, 3_800));

  const results = await projector.consumeTopic({
    topic: 'lesson.added',
    maxAttempts: 1,
  });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error, 'TIMELINE_STORAGE_DOWN');

  const transport = await bus.get({ event_id: 'evt-fail' });
  assert.equal(transport.status, EVENT_STATUSES.DEAD);
  assert.equal(transport.last_error.message, 'TIMELINE_STORAGE_DOWN');
});

test('projector never leases unsupported topics accidentally', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const timeline = createTimeline(createInMemoryTimelineAdapter());
  const projector = new EventTimelineProjector({ eventBus: bus, timeline });

  await bus.publish(event('evt-other', 'unrelated.topic', { value: 1 }));
  await assert.rejects(
    () => projector.consumeTopic({ topic: 'unrelated.topic' }),
    /TIMELINE_PROJECTOR_TOPIC_UNSUPPORTED/,
  );

  const row = await bus.get({ event_id: 'evt-other' });
  assert.equal(row.status, EVENT_STATUSES.PENDING);
  assert.equal(row.attempts, 0);
});
