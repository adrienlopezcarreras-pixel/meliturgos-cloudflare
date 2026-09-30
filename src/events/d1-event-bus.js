import { DomainError, requireValue } from '../core/contracts.js';
import {
  EVENT_STATUSES,
  ackRequest,
  eventEnvelope,
  eventIdRequest,
  failRequest,
  listRequest,
  pullRequest,
  scheduledEvent,
} from './event-bus.js';

function busError(code, status = 500) {
  return new DomainError(code, status);
}

function parseJson(value, code) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    throw busError(code, 500);
  }
}

function rowEvent(row) {
  return eventEnvelope({
    event_id: row.event_id,
    topic: row.topic,
    source: row.source,
    idempotency_key: row.idempotency_key,
    payload: parseJson(row.payload_json, 'EVENT_PAYLOAD_CORRUPT'),
    created_at: Number(row.created_at),
    ...(row.correlation_id ? { correlation_id: row.correlation_id } : {}),
    ...(row.causation_id ? { causation_id: row.causation_id } : {}),
    metadata: parseJson(row.metadata_json, 'EVENT_METADATA_CORRUPT'),
  });
}

function snapshot(row) {
  const out = {
    event: rowEvent(row),
    status: row.status,
    available_at: Number(row.available_at),
    attempts: Number(row.attempts || 0),
  };
  if (row.consumer) out.consumer = row.consumer;
  if (row.lease_token) out.lease_token = row.lease_token;
  if (row.lease_until != null) out.lease_until = Number(row.lease_until);
  if (row.acknowledged_at != null) out.acknowledged_at = Number(row.acknowledged_at);
  if (row.last_error_json) out.last_error = parseJson(row.last_error_json, 'EVENT_LAST_ERROR_CORRUPT');
  return out;
}

export class D1EventBusAdapter {
  constructor(db, { token = () => crypto.randomUUID() } = {}) {
    if (!db) throw busError('EVENT_DB_REQUIRED', 503);
    this.db = db;
    this.token = token;
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_event_bus (
      event_id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      source TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      correlation_id TEXT,
      causation_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      available_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumer TEXT,
      lease_token TEXT,
      lease_until INTEGER,
      acknowledged_at INTEGER,
      last_error_json TEXT,
      updated_at INTEGER NOT NULL
    )`).run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_event_bus_due ON mel_event_bus(status, available_at, lease_until)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_event_bus_topic_due ON mel_event_bus(topic, status, available_at)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_event_bus_idempotency ON mel_event_bus(idempotency_key)').run();
    this._ready = true;
    return this;
  }

  async byEventId(eventId) {
    await this.ready();
    return this.db.prepare('SELECT rowid, * FROM mel_event_bus WHERE event_id=?').bind(eventId).first();
  }

  async byIdempotencyKey(key) {
    await this.ready();
    return this.db.prepare('SELECT rowid, * FROM mel_event_bus WHERE idempotency_key=?').bind(key).first();
  }

  async admit(event, availableAt) {
    await this.ready();

    const duplicate = await this.byIdempotencyKey(event.idempotency_key);
    if (duplicate) return { record: duplicate, deduplicated: true };

    const sameId = await this.byEventId(event.event_id);
    requireValue(!sameId, 'EVENT_ID_EXISTS', 409);

    try {
      await this.db.prepare(`INSERT INTO mel_event_bus(
        event_id, topic, source, idempotency_key, payload_json, created_at,
        correlation_id, causation_id, metadata_json, status, available_at,
        attempts, consumer, lease_token, lease_until, acknowledged_at,
        last_error_json, updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        event.event_id,
        event.topic,
        event.source,
        event.idempotency_key,
        JSON.stringify(event.payload),
        event.created_at,
        event.correlation_id || null,
        event.causation_id || null,
        JSON.stringify(event.metadata || {}),
        EVENT_STATUSES.PENDING,
        availableAt,
        0,
        null,
        null,
        null,
        null,
        null,
        event.created_at,
      ).run();
    } catch (error) {
      const racedDuplicate = await this.byIdempotencyKey(event.idempotency_key);
      if (racedDuplicate) return { record: racedDuplicate, deduplicated: true };
      const racedId = await this.byEventId(event.event_id);
      if (racedId) throw busError('EVENT_ID_EXISTS', 409);
      throw error;
    }

    const inserted = await this.byEventId(event.event_id);
    if (!inserted) throw busError('EVENT_INSERT_FAILED', 500);
    return { record: inserted, deduplicated: false };
  }

  async publish(input) {
    const event = eventEnvelope(input);
    const admitted = await this.admit(event, event.created_at);
    return { event: rowEvent(admitted.record), deduplicated: admitted.deduplicated };
  }

  async schedule(input) {
    const scheduled = scheduledEvent(input);
    const admitted = await this.admit(scheduled.event, scheduled.available_at);
    return {
      event: rowEvent(admitted.record),
      available_at: Number(admitted.record.available_at),
      deduplicated: admitted.deduplicated,
    };
  }

  async pull(input) {
    await this.ready();
    const query = pullRequest(input);
    const sql = query.topic
      ? `SELECT rowid, * FROM mel_event_bus
         WHERE topic=? AND available_at<=?
           AND (status=? OR (status=? AND lease_until<=?))
         ORDER BY available_at ASC, rowid ASC LIMIT ?`
      : `SELECT rowid, * FROM mel_event_bus
         WHERE available_at<=?
           AND (status=? OR (status=? AND lease_until<=?))
         ORDER BY available_at ASC, rowid ASC LIMIT ?`;

    const candidateLimit = Math.min(500, Math.max(query.limit, query.limit * 5));
    const selected = query.topic
      ? await this.db.prepare(sql).bind(
          query.topic,
          query.now,
          EVENT_STATUSES.PENDING,
          EVENT_STATUSES.LEASED,
          query.now,
          candidateLimit,
        ).all()
      : await this.db.prepare(sql).bind(
          query.now,
          EVENT_STATUSES.PENDING,
          EVENT_STATUSES.LEASED,
          query.now,
          candidateLimit,
        ).all();

    const deliveries = [];
    for (const candidate of selected.results || []) {
      if (deliveries.length >= query.limit) break;
      const leaseToken = String(this.token());
      if (!leaseToken) throw busError('EVENT_LEASE_TOKEN_GENERATION_FAILED', 500);
      const leaseUntil = query.now + query.lease_ms;

      const changed = await this.db.prepare(`UPDATE mel_event_bus
        SET status=?, attempts=attempts+1, consumer=?, lease_token=?, lease_until=?, updated_at=?
        WHERE event_id=? AND available_at<=?
          AND (status=? OR (status=? AND lease_until<=?))`).bind(
        EVENT_STATUSES.LEASED,
        query.consumer,
        leaseToken,
        leaseUntil,
        query.now,
        candidate.event_id,
        query.now,
        EVENT_STATUSES.PENDING,
        EVENT_STATUSES.LEASED,
        query.now,
      ).run();

      if (!changed?.meta?.changes) continue;
      const leased = await this.byEventId(candidate.event_id);
      if (!leased) throw busError('EVENT_LEASE_READBACK_FAILED', 500);
      deliveries.push({
        event: rowEvent(leased),
        delivery: {
          consumer: leased.consumer,
          lease_token: leased.lease_token,
          lease_until: Number(leased.lease_until),
          attempt: Number(leased.attempts),
        },
      });
    }

    return deliveries;
  }

  async ack(input) {
    await this.ready();
    const request = ackRequest(input);
    const current = await this.byEventId(request.event_id);
    requireValue(current, 'EVENT_NOT_FOUND', 404);

    if (current.status === EVENT_STATUSES.ACKED) {
      requireValue(current.consumer === request.consumer, 'EVENT_ACK_CONSUMER_MISMATCH', 409);
      requireValue(current.lease_token === request.lease_token, 'EVENT_ACK_TOKEN_MISMATCH', 409);
      return snapshot(current);
    }

    requireValue(current.status === EVENT_STATUSES.LEASED, 'EVENT_NOT_LEASED', 409);
    requireValue(current.consumer === request.consumer, 'EVENT_LEASE_CONSUMER_MISMATCH', 409);
    requireValue(current.lease_token === request.lease_token, 'EVENT_LEASE_TOKEN_MISMATCH', 409);

    const changed = await this.db.prepare(`UPDATE mel_event_bus
      SET status=?, acknowledged_at=?, lease_until=NULL, updated_at=?
      WHERE event_id=? AND status=? AND consumer=? AND lease_token=?`).bind(
      EVENT_STATUSES.ACKED,
      request.acknowledged_at,
      request.acknowledged_at,
      request.event_id,
      EVENT_STATUSES.LEASED,
      request.consumer,
      request.lease_token,
    ).run();
    requireValue(Boolean(changed?.meta?.changes), 'EVENT_ACK_RACE_LOST', 409);

    return snapshot(await this.byEventId(request.event_id));
  }

  async fail(input) {
    await this.ready();
    const request = failRequest(input);
    const current = await this.byEventId(request.event_id);
    requireValue(current, 'EVENT_NOT_FOUND', 404);
    requireValue(current.status === EVENT_STATUSES.LEASED, 'EVENT_NOT_LEASED', 409);
    requireValue(current.consumer === request.consumer, 'EVENT_LEASE_CONSUMER_MISMATCH', 409);
    requireValue(current.lease_token === request.lease_token, 'EVENT_LEASE_TOKEN_MISMATCH', 409);

    const lastError = JSON.stringify({
      message: request.error,
      failed_at: request.failed_at,
      attempt: Number(current.attempts),
    });

    if (Number(current.attempts) >= request.max_attempts) {
      const changed = await this.db.prepare(`UPDATE mel_event_bus
        SET status=?, lease_until=NULL, last_error_json=?, updated_at=?
        WHERE event_id=? AND status=? AND consumer=? AND lease_token=?`).bind(
        EVENT_STATUSES.DEAD,
        lastError,
        request.failed_at,
        request.event_id,
        EVENT_STATUSES.LEASED,
        request.consumer,
        request.lease_token,
      ).run();
      requireValue(Boolean(changed?.meta?.changes), 'EVENT_FAIL_RACE_LOST', 409);
    } else {
      const changed = await this.db.prepare(`UPDATE mel_event_bus
        SET status=?, available_at=?, consumer=NULL, lease_token=NULL,
            lease_until=NULL, last_error_json=?, updated_at=?
        WHERE event_id=? AND status=? AND consumer=? AND lease_token=?`).bind(
        EVENT_STATUSES.PENDING,
        request.retry_at ?? request.failed_at,
        lastError,
        request.failed_at,
        request.event_id,
        EVENT_STATUSES.LEASED,
        request.consumer,
        request.lease_token,
      ).run();
      requireValue(Boolean(changed?.meta?.changes), 'EVENT_FAIL_RACE_LOST', 409);
    }

    return snapshot(await this.byEventId(request.event_id));
  }

  async get(input) {
    const eventId = eventIdRequest(input);
    const row = await this.byEventId(eventId);
    requireValue(row, 'EVENT_NOT_FOUND', 404);
    return snapshot(row);
  }

  async list(input = {}) {
    await this.ready();
    const query = listRequest(input);
    const clauses = [];
    const args = [];
    if (query.topic !== undefined) {
      clauses.push('topic=?');
      args.push(query.topic);
    }
    if (query.status !== undefined) {
      clauses.push('status=?');
      args.push(query.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.db.prepare(
      `SELECT rowid, * FROM mel_event_bus ${where} ORDER BY rowid ASC LIMIT ?`
    ).bind(...args, query.limit).all();
    return (result.results || []).map(snapshot);
  }
}

export function createD1EventBusAdapter(db, options = {}) {
  return new D1EventBusAdapter(db, options);
}
