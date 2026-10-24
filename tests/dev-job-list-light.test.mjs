import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';

// Minimal D1 facade over node:sqlite.
function d1() {
  const sqlite = new DatabaseSync(':memory:');
  const prepare = sql => {
    let args = [];
    const stmt = {
      bind: (...values) => { args = values; return stmt; },
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      first: async () => sqlite.prepare(sql).get(...args) || null,
      run: async () => { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    };
    return stmt;
  };
  return { prepare, batch: async list => Promise.all(list.map(s => s.run())), exec: async sql => sqlite.exec(sql) };
}

test('heartbeat list drops heavy payloads of failed/cancelled jobs but keeps active and completed ones whole', async () => {
  const repo = new D1DevJobRepository(d1());
  const heavy = {
    teacher_bridge: { status: 'ANSWERED', request: { request_id: 'r', council: 'x'.repeat(50000) } },
    teacher_bridge_history: ['y'.repeat(50000)],
    repair_cycle: { attempts: 2 },
  };
  for (const [id, status] of [['f', 'FAILED'], ['c', 'CANCELLED'], ['d', 'COMPLETED'], ['q', 'QUEUED']]) {
    await repo.create({ id, goal: id, requested_by: 'mel-autonomy' });
    await repo.db.prepare('UPDATE dev_jobs SET status=?, result_json=?, plan_json=? WHERE id=?')
      .bind(status, JSON.stringify(heavy), JSON.stringify({ preflight: { council: 'z' } }), id).run();
  }
  const byId = Object.fromEntries((await repo.list()).map(job => [job.id, job]));
  for (const id of ['f', 'c']) {
    assert.equal(byId[id].result_json.teacher_bridge.request, undefined);
    assert.equal(byId[id].result_json.teacher_bridge_history, undefined);
    assert.equal(byId[id].result_json.teacher_bridge.status, 'ANSWERED');
    assert.deepEqual(byId[id].result_json.repair_cycle, { attempts: 2 });
    assert.equal(byId[id].plan_json, null);
  }
  for (const id of ['d', 'q']) {
    assert.equal(byId[id].result_json.teacher_bridge.request.request_id, 'r');
    assert.equal(byId[id].plan_json.preflight.council, 'z');
  }
  const full = Object.fromEntries((await repo.list({ full: true })).map(job => [job.id, job]));
  assert.equal(full.f.result_json.teacher_bridge_history.length, 1);
  assert.equal((await repo.get('f')).result_json.teacher_bridge.request.request_id, 'r');
});
