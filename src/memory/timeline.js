import { port, requireValue } from '../core/contracts.js';

export const methods = ['append','list','get'];
export const createTimeline = adapters => port('timeline', methods, adapters);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => structuredClone(value);

/**
 * Canonical GEN2-12 timeline event.
 * Timeline entries are immutable facts about when something relevant happened.
 */
export function timelineEvent(record) {
  requireValue(isRecord(record), 'TIMELINE_EVENT_INVALID', 400);
  requireValue(nonEmptyString(record.event_id), 'TIMELINE_EVENT_ID_INVALID', 400);
  requireValue(nonEmptyString(record.type), 'TIMELINE_EVENT_TYPE_INVALID', 400);
  requireValue(nonEmptyString(record.title), 'TIMELINE_EVENT_TITLE_INVALID', 400);
  requireValue(typeof record.description === 'string', 'TIMELINE_EVENT_DESCRIPTION_INVALID', 400);
  requireValue(Number.isFinite(record.occurred_at), 'TIMELINE_EVENT_TIME_INVALID', 400);
  requireValue(nonEmptyString(record.source), 'TIMELINE_EVENT_SOURCE_INVALID', 400);
  requireValue(Number.isFinite(record.confidence) && record.confidence >= 0 && record.confidence <= 1, 'TIMELINE_EVENT_CONFIDENCE_INVALID', 400);
  requireValue(isRecord(record.metadata), 'TIMELINE_EVENT_METADATA_INVALID', 400);

  return clone({
    ...record,
    event_id: record.event_id.trim(),
    type: record.type.trim(),
    title: record.title.trim(),
    source: record.source.trim(),
  });
}

/** Normalize and validate the read-side query while keeping the public port generic. */
export function timelineQuery(input = {}) {
  requireValue(isRecord(input), 'TIMELINE_QUERY_INVALID', 400);
  const {
    type,
    source,
    since,
    until,
    limit = 100,
    order = 'asc',
  } = input;

  requireValue(type === undefined || nonEmptyString(type), 'TIMELINE_QUERY_TYPE_INVALID', 400);
  requireValue(source === undefined || nonEmptyString(source), 'TIMELINE_QUERY_SOURCE_INVALID', 400);
  requireValue(since === undefined || Number.isFinite(since), 'TIMELINE_QUERY_SINCE_INVALID', 400);
  requireValue(until === undefined || Number.isFinite(until), 'TIMELINE_QUERY_UNTIL_INVALID', 400);
  requireValue(since === undefined || until === undefined || since <= until, 'TIMELINE_QUERY_RANGE_INVALID', 400);
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'TIMELINE_QUERY_LIMIT_INVALID', 400);
  requireValue(order === 'asc' || order === 'desc', 'TIMELINE_QUERY_ORDER_INVALID', 400);

  return {
    ...(type === undefined ? {} : {type: type.trim()}),
    ...(source === undefined ? {} : {source: source.trim()}),
    ...(since === undefined ? {} : {since}),
    ...(until === undefined ? {} : {until}),
    limit,
    order,
  };
}

/** Validate the stable object-shaped input used by timeline.get(). */
export function timelineEventId(input = {}) {
  requireValue(isRecord(input) && nonEmptyString(input.event_id), 'TIMELINE_EVENT_ID_INVALID', 400);
  return input.event_id.trim();
}

/**
 * Reference adapter used by tests, local tools and callers that do not yet have
 * a durable store. It also specifies the persistence semantics expected from a
 * future D1 adapter: append-only IDs, deterministic chronological reads and
 * defensive copies at the boundary.
 */
export function createInMemoryTimelineAdapter(seed = []) {
  requireValue(Array.isArray(seed), 'TIMELINE_SEED_INVALID', 400);
  const events = new Map();

  for (const candidate of seed) {
    const event = timelineEvent(candidate);
    requireValue(!events.has(event.event_id), 'TIMELINE_EVENT_EXISTS', 409);
    events.set(event.event_id, event);
  }

  return Object.freeze({
    async append(input) {
      const event = timelineEvent(input);
      requireValue(!events.has(event.event_id), 'TIMELINE_EVENT_EXISTS', 409);
      events.set(event.event_id, event);
      return clone(event);
    },

    async list(input = {}) {
      const query = timelineQuery(input);
      const direction = query.order === 'asc' ? 1 : -1;
      return [...events.values()]
        .filter(event => query.type === undefined || event.type === query.type)
        .filter(event => query.source === undefined || event.source === query.source)
        .filter(event => query.since === undefined || event.occurred_at >= query.since)
        .filter(event => query.until === undefined || event.occurred_at <= query.until)
        .sort((a, b) => direction * (a.occurred_at - b.occurred_at || a.event_id.localeCompare(b.event_id)))
        .slice(0, query.limit)
        .map(clone);
    },

    async get(input = {}) {
      const eventId = timelineEventId(input);
      const event = events.get(eventId);
      requireValue(event, 'TIMELINE_EVENT_NOT_FOUND', 404);
      return clone(event);
    },
  });
}
