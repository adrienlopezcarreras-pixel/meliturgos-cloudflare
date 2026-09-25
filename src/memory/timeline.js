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

function timelineDb(db) {
  requireValue(db && typeof db.prepare === 'function', 'TIMELINE_DB_REQUIRED', 500);
  return db;
}

function parseTimelineMetadata(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    requireValue(isRecord(parsed), 'TIMELINE_EVENT_METADATA_CORRUPT', 500);
    return parsed;
  } catch (error) {
    if (error?.code === 'TIMELINE_EVENT_METADATA_CORRUPT') throw error;
    throw Object.assign(new Error('TIMELINE_EVENT_METADATA_CORRUPT'), {
      code: 'TIMELINE_EVENT_METADATA_CORRUPT',
      status: 500,
    });
  }
}

function timelineRow(row) {
  requireValue(row, 'TIMELINE_EVENT_NOT_FOUND', 404);
  return timelineEvent({
    event_id: row.event_id,
    type: row.type,
    title: row.title,
    description: row.description,
    occurred_at: Number(row.occurred_at),
    source: row.source,
    confidence: Number(row.confidence),
    metadata: parseTimelineMetadata(row.metadata),
  });
}

/**
 * Durable D1 adapter for GEN2-12.
 *
 * The canonical schema already provisions timeline_events. This adapter keeps
 * the same append-only contract as the in-memory reference implementation and
 * deliberately validates data on both write and read boundaries.
 */
export function createD1TimelineAdapter(db) {
  const database = timelineDb(db);

  return Object.freeze({
    async append(input) {
      const event = timelineEvent(input);
      const result = await database.prepare(
        `INSERT INTO timeline_events
          (event_id,type,title,description,occurred_at,source,confidence,metadata)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(event_id) DO NOTHING`,
      ).bind(
        event.event_id,
        event.type,
        event.title,
        event.description,
        event.occurred_at,
        event.source,
        event.confidence,
        JSON.stringify(event.metadata),
      ).run();

      requireValue(Number(result?.meta?.changes || 0) === 1, 'TIMELINE_EVENT_EXISTS', 409);
      return clone(event);
    },

    async list(input = {}) {
      const query = timelineQuery(input);
      const where = [];
      const params = [];

      if (query.type !== undefined) {
        where.push('type = ?');
        params.push(query.type);
      }
      if (query.source !== undefined) {
        where.push('source = ?');
        params.push(query.source);
      }
      if (query.since !== undefined) {
        where.push('occurred_at >= ?');
        params.push(query.since);
      }
      if (query.until !== undefined) {
        where.push('occurred_at <= ?');
        params.push(query.until);
      }

      const direction = query.order === 'desc' ? 'DESC' : 'ASC';
      const sql = `SELECT event_id,type,title,description,occurred_at,source,confidence,metadata
        FROM timeline_events
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY occurred_at ${direction}, event_id ${direction}
        LIMIT ?`;
      params.push(query.limit);

      const result = await database.prepare(sql).bind(...params).all();
      return (result?.results || []).map(timelineRow);
    },

    async get(input = {}) {
      const eventId = timelineEventId(input);
      const row = await database.prepare(
        `SELECT event_id,type,title,description,occurred_at,source,confidence,metadata
         FROM timeline_events
         WHERE event_id = ?`,
      ).bind(eventId).first();
      return timelineRow(row);
    },
  });
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
