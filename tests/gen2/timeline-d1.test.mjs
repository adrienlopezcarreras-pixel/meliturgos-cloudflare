import test from 'node:test';
import assert from 'node:assert/strict';

import { createTimeline } from '../../src/memory/timeline.js';
import { createD1TimelineAdapter } from '../../src/memory/d1-timeline.js';

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = compact(sql);
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    if (this.sql.startsWith('CREATE TABLE') || this.sql.startsWith('CREATE INDEX')) {
      return { success: true, meta: { changes: 0 } };
    }

    if (this.sql.startsWith('INSERT INTO mel_timeline_events')) {
      const [event_id, type, title, description, occurred_at, source, confidence, metadata_json] = this.args;
      if (this.db.rows.has(event_id)) throw new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
      this.db.rows.set(event_id, {
        event_id, type, title, description, occurred_at, source, confidence, metadata_json,
      });
      return { success: true, meta: { changes: 1 } };
    }

    throw new Error(`UNEXPECTED_SQL_RUN:${this.sql}`);
  }

  async first() {
    if (this.sql === 'SELECT * FROM mel_timeline_events WHERE event_id=?') {
      const row = this.db.rows.get(this.args[0]);
      return row ? structuredClone(row) : null;
    }
    throw new Error(`UNEXPECTED_SQL_FIRST:${this.sql}`);
  }

  async all() {
    if (!this.sql.startsWith('SELECT * FROM mel_timeline_events')) {
      throw new Error(`UNEXPECTED_SQL_ALL:${this.sql}`);
    }

    let rows = [...this.db.rows.values()];
    let arg = 0;

    if (this.sql.includes('type=?')) {
      const type = this.args[arg++];
      rows = rows.filter(row => row.type === type);
    }
    if (this.sql.includes('source=?')) {
      const source = this.args[arg++];
      rows = rows.filter(row => row.source === source);
    }
    if (this.sql.includes('occurred_at>=?')) {
      const since = this.args[arg++];
      rows = rows.filter(row => row.occurred_at >= since);
    }
    if (this.sql.includes('occurred_at<=?')) {
      const until = this.args[arg++];
      rows = rows.filter(row => row.occurred_at <= until);
    }

    const limit = this.args[arg];
    const desc = this.sql.includes('ORDER BY occurred_at DESC');
    rows.sort((a, b) => {
      const time = a.occurred_at - b.occurred_at;
      const id = a.event_id.localeCompare(b.event_id);
      return desc ? -(time || id) : (time || id);
    });

    return { results: structuredClone(rows.slice(0, limit)) };
  }
}

class FakeD1 {
  constructor() {
    this.rows = new Map();
  }
  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

function event(id, at, overrides = {}) {
  return {
    event_id: id,
    type: 'conversation',
    title: `Event ${id}`,
    description: `Description ${id}`,
    occurred_at: at,
    source: 'conversation-service',
    confidence: 1,
    metadata: { conversation_id: `conv-${id}` },
    ...overrides,
  };
}

test('D1 Timeline persists events across adapter recreation', async () => {
  const db = new FakeD1();
  const first = createTimeline(createD1TimelineAdapter(db));

  const saved = await first.append(event('evt-1', 1_000));
  assert.equal(saved.event_id, 'evt-1');

  const second = createTimeline(createD1TimelineAdapter(db));
  const restored = await second.get({ event_id: 'evt-1' });
  assert.deepEqual(restored, saved);
});

test('D1 Timeline preserves append-only event ids', async () => {
  const db = new FakeD1();
  const timeline = createTimeline(createD1TimelineAdapter(db));

  await timeline.append(event('evt-dup', 1_000));
  await assert.rejects(
    () => timeline.append(event('evt-dup', 2_000, { title: 'replacement forbidden' })),
    { code: 'TIMELINE_EVENT_EXISTS', status: 409 },
  );

  const stored = await timeline.get({ event_id: 'evt-dup' });
  assert.equal(stored.occurred_at, 1_000);
  assert.equal(stored.title, 'Event evt-dup');
});

test('D1 Timeline filters by type, source and time range deterministically', async () => {
  const db = new FakeD1();
  const timeline = createTimeline(createD1TimelineAdapter(db));

  await timeline.append(event('b', 2_000, { type: 'decision', source: 'projects' }));
  await timeline.append(event('a', 1_000, { type: 'decision', source: 'projects' }));
  await timeline.append(event('c', 3_000, { type: 'memory', source: 'memory' }));
  await timeline.append(event('d', 2_000, { type: 'decision', source: 'projects' }));

  const decisions = await timeline.list({
    type: 'decision',
    source: 'projects',
    since: 1_500,
    until: 2_500,
    order: 'asc',
  });
  assert.deepEqual(decisions.map(row => row.event_id), ['b', 'd']);

  const descending = await timeline.list({ order: 'desc', limit: 3 });
  assert.deepEqual(descending.map(row => row.event_id), ['c', 'd', 'b']);
});

test('D1 Timeline returns defensive copies and fails closed on corrupt metadata', async () => {
  const db = new FakeD1();
  const timeline = createTimeline(createD1TimelineAdapter(db));

  await timeline.append(event('evt-safe', 1_000));
  const first = await timeline.get({ event_id: 'evt-safe' });
  first.metadata.conversation_id = 'mutated-outside';
  const second = await timeline.get({ event_id: 'evt-safe' });
  assert.equal(second.metadata.conversation_id, 'conv-evt-safe');

  db.rows.set('evt-corrupt', {
    event_id: 'evt-corrupt',
    type: 'memory',
    title: 'Corrupt',
    description: 'Corrupt',
    occurred_at: 2_000,
    source: 'memory',
    confidence: 1,
    metadata_json: '{bad-json',
  });

  await assert.rejects(
    () => timeline.get({ event_id: 'evt-corrupt' }),
    { code: 'TIMELINE_METADATA_CORRUPT', status: 500 },
  );
});
