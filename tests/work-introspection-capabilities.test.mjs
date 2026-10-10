import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeWorkIndexRows, listPersistentWork } from '../src/capabilities/work-introspection-capabilities.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

function fakeDb(rows = [], { initialized = true } = {}) {
  return {
    prepare(sql) {
      const state = { sql, values: [] };
      return {
        bind(...values) { state.values = values; return this; },
        async first() { return sql.includes('sqlite_master') && initialized ? { name: 'work_dags' } : null; },
        async run() { throw Error('WORK_READ_ATTEMPTED_D1_MUTATION'); },
        async all() {
          let result = rows;
          if (sql.includes("status IN ('RUNNING','WAITING')")) result = result.filter(row => ['RUNNING','WAITING'].includes(row.status));
          else if (sql.includes('status=?')) result = result.filter(row => row.status === state.values[0]);
          const limit = Number(state.values.at(-1) || 20);
          return { results: result.slice(0, limit) };
        },
      };
    },
  };
}

test('work index sanitizer exposes metadata only and normalizes unknown status', () => {
  const rows = sanitizeWorkIndexRows([{ id: 'w1', job_id: 'j1', status: 'RUNNING', record_json: '{secret}', created_at: 1, updated_at: 2 }, { id: 'w2', job_id: 'j2', status: 'weird' }]);
  assert.equal(rows[0].status, 'RUNNING');
  assert.equal('record_json' in rows[0], false);
  assert.equal(rows[1].status, 'UNKNOWN');
});

test('work.open returns only resumable RUNNING and WAITING jobs', async () => {
  const db = fakeDb([
    { id: 'a', job_id: 'ja', status: 'RUNNING', created_at: 1, updated_at: 4 },
    { id: 'b', job_id: 'jb', status: 'COMPLETED', created_at: 1, updated_at: 3 },
    { id: 'c', job_id: 'jc', status: 'WAITING', created_at: 1, updated_at: 2 },
  ]);
  const result = await listPersistentWork(db, { openOnly: true });
  assert.deepEqual(result.work.map(row => row.id), ['a', 'c']);
  assert.equal(result.open_only, true);
});

test('work list validates status and bounds results', async () => {
  const db = fakeDb(Array.from({ length: 120 }, (_, index) => ({ id: `w${index}`, job_id: `j${index}`, status: 'COMPLETED', updated_at: 120-index })));
  const result = await listPersistentWork(db, { status: 'COMPLETED', limit: 200 });
  assert.equal(result.count, 100);
  await assert.rejects(() => listPersistentWork(db, { status: 'INVALID' }), error => error.code === 'WORK_STATUS_INVALID');
});

test('Gen2 runtime exposes work.list and work.open as low-risk restart discovery', () => {
  const runtime = createGen2Runtime({ env: { DB: fakeDb(), MEL_GITHUB_FETCH: async () => new Response('{}', { status: 500 }) } });
  for (const id of ['work.list', 'work.open']) {
    const row = runtime.bus.list().find(item => item.id === id);
    assert.ok(row, id);
    assert.equal(row.risk, 'LOW');
    assert.equal(row.enabled, true);
  }
});

test('work listing never creates tables and reports an uninitialized store as empty', async () => {
  let readQueries = 0;
  const db = {
    prepare(sql) {
      assert.match(sql, /^SELECT name FROM sqlite_master/);
      readQueries++;
      return {
        async first() { return null; },
        async run() { throw Error('READ_ONLY_D1_MUTATION_FORBIDDEN'); },
      };
    },
  };
  const list = await listPersistentWork(db, { limit: 1 });
  assert.equal(list.ok, true);
  assert.equal(list.store_initialized, false);
  assert.equal(list.count, 0);
  assert.deepEqual(list.work, []);
  const open = await listPersistentWork(db, { openOnly: true, limit: 1 });
  assert.equal(open.store_initialized, false);
  assert.equal(open.open_only, true);
  assert.equal(readQueries, 2);
});

test('work listing on existing store uses bounded SELECT only and never runs DDL', async () => {
  const sourceRows = [{ id:'w1',job_id:'j1',status:'WAITING',created_at:10,updated_at:11 }];
  const list = await listPersistentWork(fakeDb(sourceRows), { limit: 1 });
  assert.equal(list.store_initialized, true);
  assert.equal(list.count, 1);
  assert.equal(list.work[0].id, 'w1');
});
