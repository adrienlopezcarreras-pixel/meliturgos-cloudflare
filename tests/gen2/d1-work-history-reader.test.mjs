import test from 'node:test';
import assert from 'node:assert/strict';

import { D1WorkHistoryReader } from '../../src/work/d1-work-history-reader.js';

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = String(sql).replace(/\s+/g, ' ').trim();
    this.args = [];
  }
  bind(...args) { this.args = args; return this; }
  async run() {
    if (this.sql.startsWith('CREATE TABLE')) return { success: true, meta: { changes: 0 } };
    throw new Error(`UNEXPECTED_SQL_RUN:${this.sql}`);
  }
  async all() {
    if (!this.sql.startsWith('SELECT id,job_id,status,created_at,updated_at FROM work_dags')) {
      throw new Error(`UNEXPECTED_SQL_ALL:${this.sql}`);
    }
    const limit = this.args.at(-1);
    const rows = [...this.db.rows]
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, limit);
    return { results: structuredClone(rows) };
  }
}

class FakeD1 {
  constructor(rows) { this.rows = rows; }
  prepare(sql) { return new FakeStatement(this, sql); }
}

test('D1WorkHistoryReader lists bounded persistent Work metadata and loads exact DAG id', async () => {
  const db = new FakeD1([
    { id: 'w1', job_id: 'j1', status: 'RUNNING', created_at: 1_000, updated_at: 4_000 },
    { id: 'w2', job_id: 'j2', status: 'COMPLETED', created_at: 2_000, updated_at: 5_000 },
  ]);
  const loaded = [];
  const reader = new D1WorkHistoryReader(db, {
    storeFactory: (_db, id) => ({
      load: async () => {
        loaded.push(id);
        return { id, job_id: `job-${id}`, audit: [] };
      },
    }),
  });

  const index = await reader.list({ limit: 1 });
  assert.equal(index.count, 1);
  assert.equal(index.work[0].id, 'w2');

  const dag = await reader.load('w1');
  assert.equal(dag.id, 'w1');
  assert.deepEqual(loaded, ['w1']);
});

test('D1WorkHistoryReader fails closed on missing id', async () => {
  const reader = new D1WorkHistoryReader(new FakeD1([]), {
    storeFactory: () => ({ load: async () => null }),
  });
  await assert.rejects(
    () => reader.load(''),
    error => error?.code === 'WORK_HISTORY_ID_REQUIRED',
  );
});
