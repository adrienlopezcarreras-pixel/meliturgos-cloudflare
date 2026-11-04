import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { devRuntime } from '../src/dev/runtime-api.js';
import { setAutonomyControl, setOwnerMaxAutonomy } from '../src/evolution/autonomy-control.js';

function fixture(db, requester = 'mel-autonomy') {
  let claims = 0;
  const job = { id: 'max-audit-02', requested_by: requester, result_json: { bridge_preparation: { status: 'READY' } } };
  const repository = {
    get: async id => id === job.id ? job : null,
    claimPrepared: async () => { claims += 1; return { ...job, status: 'CLAIMED' }; },
    claim: async () => { claims += 1; return { ...job, status: 'CLAIMED' }; },
  };
  const request = new Request('https://mel.test/api/dev-bridge/claim', {
    method: 'POST', headers: { authorization: 'Bearer valid-bridge-key', 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: job.id }),
  });
  const run = () => devRuntime(request.clone(), { DB: db, MEL_DEV_BRIDGE_TOKEN: 'valid-bridge-key' }, { repository });
  return { run, getClaims: () => claims };
}

test('paused owner MAX must not permit a new cloud/local bridge claim', async t => {
  const db = sqliteD1();
  t.after(() => db.close());
  await setAutonomyControl(db, { paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop' });
  const bridge = fixture(db);
  const response = await bridge.run();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'AUTONOMY_OWNER_STOP_PAUSED');
  assert.equal(bridge.getClaims(), 0);
});

test('legacy owner MAX-off with paused=false also blocks a claim until reconciled', async t => {
  const db = sqliteD1();
  t.after(() => db.close());
  await setOwnerMaxAutonomy(db, { enabled: true, paused: false, source: 'owner-ui-launch-gate', reason: 'owner-max-autonomy' });
  await setOwnerMaxAutonomy(db, { enabled: false, source: 'owner-ui', reason: null });
  const bridge = fixture(db);
  const response = await bridge.run();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'AUTONOMY_OWNER_STOP_PAUSED');
  assert.equal(bridge.getClaims(), 0);
});

test('explicit owner-chat bridge job remains available while MAX is paused', async t => {
  const db = sqliteD1();
  t.after(() => db.close());
  await setAutonomyControl(db, { paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop' });
  const bridge = fixture(db, 'owner-chat');
  const response = await bridge.run();
  // Local bridge authorization is a separate safeguard: a disabled local
  // executor may still refuse with 409. Owner STOP must not be its reason.
  const result = await response.json();
  assert.notEqual(result.code, 'AUTONOMY_OWNER_STOP_PAUSED');
  assert.equal(response.status, 409);
  assert.equal(result.code, 'LOCAL_FALLBACK_NOT_AUTHORIZED_OR_CLOUD_AVAILABLE');
  assert.equal(bridge.getClaims(), 0);
});

test('the bridge does not claim a MAX job when its pause control cannot be read', async t => {
  const db = sqliteD1();
  t.after(() => db.close());
  const bridge = fixture({ prepare: () => { throw new Error('D1 unavailable'); } });
  const response = await bridge.run();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'AUTONOMY_PAUSE_CHECK_FAILED');
  assert.equal(bridge.getClaims(), 0);
});
