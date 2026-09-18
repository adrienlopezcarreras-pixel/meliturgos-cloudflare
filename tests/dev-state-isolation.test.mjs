import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { readLastSafeWorkJob, writeLastSafeWorkJob } from '../src/dev/dev-bridge-state-store.js';

test('D1DevJobRepository memory fallback is isolated per instance by default', async () => {
  const first = new D1DevJobRepository(null);
  const second = new D1DevJobRepository(null);
  const created = await first.create({ goal: 'isolated memory job' });
  assert.ok(await first.get(created.id));
  assert.equal(await second.get(created.id), null);
  assert.equal((await second.list()).length, 0);
});

test('D1DevJobRepository can still share memory only when explicitly injected', async () => {
  const shared = new Map();
  const first = new D1DevJobRepository(null, { memoryStore: shared });
  const second = new D1DevJobRepository(null, { memoryStore: shared });
  const created = await first.create({ goal: 'explicitly shared fixture' });
  assert.equal((await second.get(created.id))?.goal, 'explicitly shared fixture');
});

function fakeBridgeDb() {
  let row = null;
  return {
    prepare(sql) {
      const statement = {
        args: [],
        bind(...args) { this.args = args; return this; },
        async run() {
          if (/INSERT INTO dev_bridge_state/i.test(sql)) {
            row = {
              bridge_id: this.args[0],
              last_seen: this.args[1],
              status: this.args[2],
              metadata_json: this.args[3],
            };
          }
          return { success: true, meta: { changes: 1 } };
        },
        async first() {
          if (/SELECT MAX\(version\)/i.test(sql)) return { v: 999 };
          if (/FROM dev_bridge_state/i.test(sql)) return row;
          return null;
        },
      };
      return statement;
    },
  };
}

test('Dev Bridge safe-work state persists through explicit D1 storage', async () => {
  const db = fakeBridgeDb();
  const job = {
    id: 'safe-work-1',
    mode: 'preflight-only',
    status: 'PREPARED',
    goal: 'audit runtime state',
    created_at: '2026-09-18T13:00:00.000Z',
    preflight: { ok: true },
  };
  assert.equal(await writeLastSafeWorkJob(db, job), true);
  assert.deepEqual(await readLastSafeWorkJob(db), job);
});

test('Dev Bridge safe-work state does not invent persistence without D1', async () => {
  assert.equal(await writeLastSafeWorkJob(null, { id: 'x' }), false);
  assert.equal(await readLastSafeWorkJob(null), null);
});
