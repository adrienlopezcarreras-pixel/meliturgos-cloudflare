import test from 'node:test';
import assert from 'node:assert/strict';

import { createEventBus, EVENT_STATUSES } from '../../src/events/event-bus.js';
import { createD1EventBusAdapter } from '../../src/events/d1-event-bus.js';

function normalized(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = normalized(sql);
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    const sql = this.sql;
    if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) {
      return { success: true, meta: { changes: 0 } };
    }

    if (sql.startsWith('INSERT INTO mel_event_bus')) {
      const [
        event_id, topic, source, idempotency_key, payload_json, created_at,
        correlation_id, causation_id, metadata_json, status, available_at,
        attempts, consumer, lease_token, lease_until, acknowledged_at,
        last_error_json, updated_at,
      ] = this.args;
      if (this.db.byId.has(event_id) || this.db.byKey.has(idempotency_key)) {
        throw new Error('SQLITE_CONSTRAINT_UNIQUE');
      }
      const row = {
        rowid: ++this.db.sequence,
        event_id, topic, source, idempotency_key, payload_json, created_at,
        correlation_id, causation_id, metadata_json, status, available_at,
        attempts, consumer, lease_token, lease_until, acknowledged_at,
        last_error_json, updated_at,
      };
      this.db.byId.set(event_id, row);
      this.db.byKey.set(idempotency_key, event_id);
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE mel_event_bus SET status=?, attempts=attempts+1')) {
      const [status, consumer, lease_token, lease_until, updated_at, event_id, now, pending, leased, leaseExpiredAt] = this.args;
      const row = this.db.byId.get(event_id);
      const eligible = row
        && row.available_at <= now
        && (row.status === pending || (row.status === leased && row.lease_until <= leaseExpiredAt));
      if (!eligible) return { success: true, meta: { changes: 0 } };
      Object.assign(row, {
        status,
        attempts: Number(row.attempts || 0) + 1,
        consumer,
        lease_token,
        lease_until,
        updated_at,
      });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE mel_event_bus SET status=?, acknowledged_at=?')) {
      const [status, acknowledged_at, updated_at, event_id, requiredStatus, consumer, leaseToken] = this.args;
      const row = this.db.byId.get(event_id);
      if (!row || row.status !== requiredStatus || row.consumer !== consumer || row.lease_token !== leaseToken) {
        return { success: true, meta: { changes: 0 } };
      }
      Object.assign(row, { status, acknowledged_at, lease_until: null, updated_at });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.includes('SET status=?, lease_until=NULL, last_error_json=?')) {
      const [status, last_error_json, updated_at, event_id, requiredStatus, consumer, leaseToken] = this.args;
      const row = this.db.byId.get(event_id);
      if (!row || row.status !== requiredStatus || row.consumer !== consumer || row.lease_token !== leaseToken) {
        return { success: true, meta: { changes: 0 } };
      }
      Object.assign(row, { status, lease_until: null, last_error_json, updated_at });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.includes('SET status=?, available_at=?, consumer=NULL')) {
      const [status, available_at, last_error_json, updated_at, event_id, requiredStatus, consumer, leaseToken] = this.args;
      const row = this.db.byId.get(event_id);
      if (!row || row.status !== requiredStatus || row.consumer !== consumer || row.lease_token !== leaseToken) {
        return { success: true, meta: { changes: 0 } };
      }
      Object.assign(row, {
        status,
        available_at,
        consumer: null,
        lease_token: null,
        lease_until: null,
        last_error_json,
        updated_at,
      });
      return { success: true, meta: { changes: 1 } };
    }

    throw new Error(`UNEXPECTED_SQL_RUN:${sql}`);
  }

  async first() {
    if (this.sql.includes('WHERE event_id=?')) {
      const row = this.db.byId.get(this.args[0]);
      return row ? structuredClone(row) : null;
    }
    if (this.sql.includes('WHERE idempotency_key=?')) {
      const id = this.db.byKey.get(this.args[0]);
      const row = id ? this.db.byId.get(id) : null;
      return row ? structuredClone(row) : null;
    }
    throw new Error(`UNEXPECTED_SQL_FIRST:${this.sql}`);
  }

  async all() {
    let rows = [...this.db.byId.values()].sort((a, b) => a.rowid - b.rowid);

    if (this.sql.includes('WHERE topic=? AND available_at<=?')) {
      const [topic, now, pending, leased, leaseExpiredAt, limit] = this.args;
      rows = rows
        .filter(row => row.topic === topic)
        .filter(row => row.available_at <= now)
        .filter(row => row.status === pending || (row.status === leased && row.lease_until <= leaseExpiredAt))
        .sort((a, b) => a.available_at - b.available_at || a.rowid - b.rowid)
        .slice(0, limit);
      return { results: structuredClone(rows) };
    }

    if (this.sql.includes('WHERE available_at<=?') && this.sql.includes('(status=? OR')) {
      const [now, pending, leased, leaseExpiredAt, limit] = this.args;
      rows = rows
        .filter(row => row.available_at <= now)
        .filter(row => row.status === pending || (row.status === leased && row.lease_until <= leaseExpiredAt))
        .sort((a, b) => a.available_at - b.available_at || a.rowid - b.rowid)
        .slice(0, limit);
      return { results: structuredClone(rows) };
    }

    if (this.sql.startsWith('SELECT rowid, * FROM mel_event_bus')) {
      let index = 0;
      if (this.sql.includes('WHERE topic=? AND status=?')) {
        const [topic, status, limit] = this.args;
        rows = rows.filter(row => row.topic === topic && row.status === status).slice(0, limit);
      } else if (this.sql.includes('WHERE topic=?')) {
        const [topic, limit] = this.args;
        rows = rows.filter(row => row.topic === topic).slice(0, limit);
      } else if (this.sql.includes('WHERE status=?')) {
        const [status, limit] = this.args;
        rows = rows.filter(row => row.status === status).slice(0, limit);
      } else {
        const [limit] = this.args;
        rows = rows.slice(0, limit);
      }
      void index;
      return { results: structuredClone(rows) };
    }

    throw new Error(`UNEXPECTED_SQL_ALL:${this.sql}`);
  }
}

class FakeD1 {
  constructor() {
    this.byId = new Map();
    this.byKey = new Map();
    this.sequence = 0;
  }
  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

function event(id, at = 1_000, overrides = {}) {
  return {
    event_id: id,
    topic: 'work.completed',
    source: 'work-engine',
    idempotency_key: `idem:${id}`,
    payload: { task_id: `task:${id}` },
    created_at: at,
    metadata: { owner: 'mel' },
    ...overrides,
  };
}

function durableBus(db, prefix = 'lease') {
  let seq = 0;
  return createEventBus(createD1EventBusAdapter(db, {
    token: () => `${prefix}-${++seq}`,
  }));
}

test('D1 Event Bus survives adapter recreation and keeps idempotency', async () => {
  const db = new FakeD1();
  const first = durableBus(db, 'a');

  const admitted = await first.publish(event('evt-1'));
  assert.equal(admitted.deduplicated, false);

  const second = durableBus(db, 'b');
  const duplicate = await second.publish(event('evt-2', 2_000, {
    idempotency_key: 'idem:evt-1',
    payload: { task_id: 'must-not-replace' },
  }));

  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.event.event_id, 'evt-1');
  assert.deepEqual((await second.list()).map(row => row.event.event_id), ['evt-1']);

  await assert.rejects(
    () => second.publish(event('evt-1', 3_000, { idempotency_key: 'idem:new-key' })),
    { code: 'EVENT_ID_EXISTS', status: 409 },
  );
});

test('D1 Event Bus schedules, leases, redelivers and idempotently acknowledges', async () => {
  const db = new FakeD1();
  const bus = durableBus(db);

  await bus.schedule({
    event: event('follow-1', 1_000, { topic: 'followup.due' }),
    available_at: 5_000,
  });

  assert.deepEqual(await bus.pull({
    consumer: 'worker-a',
    topic: 'followup.due',
    now: 4_999,
  }), []);

  const [first] = await bus.pull({
    consumer: 'worker-a',
    topic: 'followup.due',
    now: 5_000,
    lease_ms: 100,
  });
  assert.equal(first.delivery.attempt, 1);
  assert.equal(first.delivery.lease_until, 5_100);

  assert.equal((await bus.pull({ consumer: 'worker-b', now: 5_050 })).length, 0);

  const [second] = await bus.pull({ consumer: 'worker-b', now: 5_101, lease_ms: 100 });
  assert.equal(second.delivery.attempt, 2);
  assert.notEqual(second.delivery.lease_token, first.delivery.lease_token);

  const ack = {
    event_id: 'follow-1',
    consumer: 'worker-b',
    lease_token: second.delivery.lease_token,
    acknowledged_at: 5_120,
  };
  assert.equal((await bus.ack(ack)).status, EVENT_STATUSES.ACKED);
  assert.equal((await bus.ack(ack)).status, EVENT_STATUSES.ACKED);
  assert.equal((await bus.pull({ consumer: 'worker-c', now: 99_999 })).length, 0);
});

test('D1 Event Bus persists retry and dead-letter state', async () => {
  const db = new FakeD1();
  const first = durableBus(db, 'first');
  await first.publish(event('evt-fail'));

  const [attempt1] = await first.pull({ consumer: 'worker-a', now: 1_000 });
  const pending = await first.fail({
    event_id: 'evt-fail',
    consumer: 'worker-a',
    lease_token: attempt1.delivery.lease_token,
    error: 'temporary',
    failed_at: 1_010,
    retry_at: 2_000,
    max_attempts: 2,
  });
  assert.equal(pending.status, EVENT_STATUSES.PENDING);
  assert.equal(pending.available_at, 2_000);

  const second = durableBus(db, 'second');
  assert.equal((await second.pull({ consumer: 'worker-b', now: 1_999 })).length, 0);

  const [attempt2] = await second.pull({ consumer: 'worker-b', now: 2_000 });
  const dead = await second.fail({
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

  const third = durableBus(db, 'third');
  const restored = await third.get({ event_id: 'evt-fail' });
  assert.equal(restored.status, EVENT_STATUSES.DEAD);
  assert.equal(restored.last_error.attempt, 2);
});

test('D1 Event Bus list remains deterministic and filterable after restart', async () => {
  const db = new FakeD1();
  const bus = durableBus(db);
  await bus.publish(event('evt-a', 1_000, { topic: 'alpha' }));
  await bus.publish(event('evt-b', 1_100, { topic: 'beta' }));
  await bus.publish(event('evt-c', 1_200, { topic: 'alpha' }));

  const restarted = durableBus(db, 'restart');
  assert.deepEqual(
    (await restarted.list({ topic: 'alpha' })).map(row => row.event.event_id),
    ['evt-a', 'evt-c'],
  );

  const [leased] = await restarted.pull({ consumer: 'worker', topic: 'beta', now: 2_000 });
  assert.equal(leased.event.event_id, 'evt-b');
  assert.deepEqual(
    (await restarted.list({ status: EVENT_STATUSES.LEASED })).map(row => row.event.event_id),
    ['evt-b'],
  );
});
