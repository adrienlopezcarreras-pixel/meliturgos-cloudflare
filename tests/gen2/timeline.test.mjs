import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createD1TimelineAdapter,
  createInMemoryTimelineAdapter,
  createTimeline,
  timelineEvent,
  timelineEventId,
  timelineQuery,
} from '../../src/memory/timeline.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

async function foundationD1() {
  const db = sqliteD1();
  await db.prepare(`CREATE TABLE IF NOT EXISTS timeline_events (
    event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    source TEXT NOT NULL,
    confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
    metadata TEXT NOT NULL DEFAULT '{}'
  )`).run();
  return db;
}

const event = (event_id, occurred_at, overrides = {}) => ({
  event_id,
  type: 'memory.confirmed',
  title: `Event ${event_id}`,
  description: 'Important MEL event',
  occurred_at,
  source: 'memory',
  confidence: 0.9,
  metadata: { conversation_id: 'conv-1' },
  ...overrides,
});

test('timelineEvent validates, normalizes and clones canonical events', () => {
  const input = event('  evt-1  ', 1000, { type: ' memory.confirmed ', source: ' memory ' });
  const normalized = timelineEvent(input);

  assert.equal(normalized.event_id, 'evt-1');
  assert.equal(normalized.type, 'memory.confirmed');
  assert.equal(normalized.source, 'memory');
  assert.notEqual(normalized, input);
  assert.notEqual(normalized.metadata, input.metadata);

  input.metadata.conversation_id = 'mutated';
  assert.equal(normalized.metadata.conversation_id, 'conv-1');
  assert.throws(() => timelineEvent({ ...event('bad', 1), confidence: 2 }), { code: 'TIMELINE_EVENT_CONFIDENCE_INVALID' });
  assert.throws(() => timelineEvent({ ...event('bad', 1), metadata: [] }), { code: 'TIMELINE_EVENT_METADATA_INVALID' });
});

test('timeline port stays fail-closed and preserves the stable adapter contract', async () => {
  const missing = createTimeline();
  await assert.rejects(() => missing.append(event('evt-1', 1)), { code: 'NOT_IMPLEMENTED:timeline.append' });

  const service = createTimeline(createInMemoryTimelineAdapter());
  const appended = await service.append(event('evt-1', 1));
  assert.equal(appended.event_id, 'evt-1');
});

test('in-memory adapter is append-only and returns defensive copies', async () => {
  const service = createTimeline(createInMemoryTimelineAdapter());
  const appended = await service.append(event('evt-1', 1000));
  appended.metadata.conversation_id = 'changed-outside';

  const stored = await service.get({ event_id: 'evt-1' });
  assert.equal(stored.metadata.conversation_id, 'conv-1');
  stored.title = 'changed-again';
  assert.equal((await service.get({ event_id: 'evt-1' })).title, 'Event evt-1');

  await assert.rejects(() => service.append(event('evt-1', 2000)), { code: 'TIMELINE_EVENT_EXISTS', status: 409 });
  await assert.rejects(() => service.get({ event_id: 'missing' }), { code: 'TIMELINE_EVENT_NOT_FOUND', status: 404 });
});

test('timeline list is deterministic, chronological and filterable', async () => {
  const service = createTimeline(createInMemoryTimelineAdapter([
    event('evt-c', 3000, { type: 'task.finished', source: 'teacher' }),
    event('evt-a', 1000),
    event('evt-b', 2000, { type: 'task.finished', source: 'teacher' }),
    event('evt-b2', 2000, { type: 'task.finished', source: 'teacher' }),
  ]));

  assert.deepEqual((await service.list()).map(item => item.event_id), ['evt-a', 'evt-b', 'evt-b2', 'evt-c']);
  assert.deepEqual((await service.list({ order: 'desc' })).map(item => item.event_id), ['evt-c', 'evt-b2', 'evt-b', 'evt-a']);
  assert.deepEqual(
    (await service.list({ type: 'task.finished', source: 'teacher', since: 1500, until: 2500 })).map(item => item.event_id),
    ['evt-b', 'evt-b2'],
  );
  assert.deepEqual((await service.list({ limit: 2 })).map(item => item.event_id), ['evt-a', 'evt-b']);
});

test('timeline query and get inputs fail closed on invalid ranges and identifiers', () => {
  assert.deepEqual(timelineQuery(), { limit: 100, order: 'asc' });
  assert.throws(() => timelineQuery({ since: 20, until: 10 }), { code: 'TIMELINE_QUERY_RANGE_INVALID' });
  assert.throws(() => timelineQuery({ limit: 0 }), { code: 'TIMELINE_QUERY_LIMIT_INVALID' });
  assert.throws(() => timelineQuery({ order: 'sideways' }), { code: 'TIMELINE_QUERY_ORDER_INVALID' });
  assert.throws(() => timelineEventId({ event_id: ' ' }), { code: 'TIMELINE_EVENT_ID_INVALID' });
});


test('D1 timeline adapter persists events across service instances and preserves deterministic filters', async (t) => {
  const db = await foundationD1();
  t.after(() => db.close());

  const first = createTimeline(createD1TimelineAdapter(db));
  await first.append(event('evt-c', 3000, { type: 'task.finished', source: 'teacher' }));
  await first.append(event('evt-a', 1000));
  await first.append(event('evt-b', 2000, { type: 'task.finished', source: 'teacher' }));

  const second = createTimeline(createD1TimelineAdapter(db));
  assert.equal((await second.get({ event_id: 'evt-a' })).title, 'Event evt-a');
  assert.deepEqual(
    (await second.list({ type: 'task.finished', source: 'teacher', order: 'desc' })).map(item => item.event_id),
    ['evt-c', 'evt-b'],
  );
  await assert.rejects(() => second.append(event('evt-a', 9999)), { code: 'TIMELINE_EVENT_EXISTS', status: 409 });
});

test('D1 timeline adapter fails closed when persisted metadata is corrupt', async (t) => {
  const db = await foundationD1();
  t.after(() => db.close());

  await db.prepare(`INSERT INTO timeline_events(
    event_id, type, title, description, occurred_at, source, confidence, metadata
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    'evt-corrupt', 'memory.confirmed', 'Corrupt', 'Corrupt metadata fixture',
    1, 'test', 1, '{broken',
  ).run();

  const service = createTimeline(createD1TimelineAdapter(db));
  await assert.rejects(
    () => service.get({ event_id: 'evt-corrupt' }),
    { code: 'TIMELINE_EVENT_METADATA_CORRUPT', status: 500 },
  );
});
