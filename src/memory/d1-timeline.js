import { DomainError, requireValue } from '../core/contracts.js';
import {
  timelineEvent,
  timelineEventId,
  timelineQuery,
} from './timeline.js';

function timelineError(code, status = 500) {
  return new DomainError(code, status);
}

function parseMetadata(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw timelineError('TIMELINE_METADATA_CORRUPT', 500);
  }
}

function rowToEvent(row) {
  if (!row) return null;
  return timelineEvent({
    event_id: row.event_id,
    type: row.type,
    title: row.title,
    description: row.description,
    occurred_at: Number(row.occurred_at),
    source: row.source,
    confidence: Number(row.confidence),
    metadata: parseMetadata(row.metadata_json),
  });
}

export class D1TimelineAdapter {
  constructor(db) {
    if (!db) throw timelineError('TIMELINE_DB_REQUIRED', 503);
    this.db = db;
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_timeline_events (
      event_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    )`).run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_timeline_time ON mel_timeline_events(occurred_at, event_id)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_timeline_type_time ON mel_timeline_events(type, occurred_at)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_timeline_source_time ON mel_timeline_events(source, occurred_at)').run();
    this._ready = true;
    return this;
  }

  async append(input) {
    await this.ready();
    const event = timelineEvent(input);
    const existing = await this.db.prepare(
      'SELECT * FROM mel_timeline_events WHERE event_id=?'
    ).bind(event.event_id).first();
    requireValue(!existing, 'TIMELINE_EVENT_EXISTS', 409);

    try {
      await this.db.prepare(`INSERT INTO mel_timeline_events(
        event_id, type, title, description, occurred_at, source, confidence, metadata_json
      ) VALUES(?,?,?,?,?,?,?,?)`).bind(
        event.event_id,
        event.type,
        event.title,
        event.description,
        event.occurred_at,
        event.source,
        event.confidence,
        JSON.stringify(event.metadata || {}),
      ).run();
    } catch (error) {
      const raced = await this.db.prepare(
        'SELECT * FROM mel_timeline_events WHERE event_id=?'
      ).bind(event.event_id).first();
      if (raced) throw timelineError('TIMELINE_EVENT_EXISTS', 409);
      throw error;
    }

    const inserted = await this.db.prepare(
      'SELECT * FROM mel_timeline_events WHERE event_id=?'
    ).bind(event.event_id).first();
    if (!inserted) throw timelineError('TIMELINE_EVENT_INSERT_FAILED', 500);
    return rowToEvent(inserted);
  }

  async get(input = {}) {
    await this.ready();
    const eventId = timelineEventId(input);
    const row = await this.db.prepare(
      'SELECT * FROM mel_timeline_events WHERE event_id=?'
    ).bind(eventId).first();
    requireValue(row, 'TIMELINE_EVENT_NOT_FOUND', 404);
    return rowToEvent(row);
  }

  async list(input = {}) {
    await this.ready();
    const query = timelineQuery(input);
    const clauses = [];
    const args = [];

    if (query.type !== undefined) {
      clauses.push('type=?');
      args.push(query.type);
    }
    if (query.source !== undefined) {
      clauses.push('source=?');
      args.push(query.source);
    }
    if (query.since !== undefined) {
      clauses.push('occurred_at>=?');
      args.push(query.since);
    }
    if (query.until !== undefined) {
      clauses.push('occurred_at<=?');
      args.push(query.until);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const direction = query.order === 'desc' ? 'DESC' : 'ASC';
    const result = await this.db.prepare(
      `SELECT * FROM mel_timeline_events ${where}
       ORDER BY occurred_at ${direction}, event_id ${direction}
       LIMIT ?`
    ).bind(...args, query.limit).all();

    return (result.results || []).map(rowToEvent);
  }
}

export function createD1TimelineAdapter(db) {
  return new D1TimelineAdapter(db);
}
