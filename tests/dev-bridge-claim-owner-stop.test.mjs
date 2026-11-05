import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { devRuntime } from '../src/dev/runtime-api.js';
import { setAutonomyControl, setOwnerMaxAutonomy } from '../src/evolution/autonomy-control.js';

function fixture(db, requester = 'mel-autonomy') {
  let claims = 0;
  const job = { id: 'max-audit-02', status: 'CLAIMED', requested_by: requester, result_json: { bridge_preparation: { status: 'READY' } } };
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

test('OIDC precommit cannot proceed while MAX owner stop is persisted', async t => {
  const db = sqliteD1(); t.after(() => db.close());
  await setAutonomyControl(db, { paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop' });
  const job = { id: 'max-audit-02', status: 'CLAIMED', requested_by: 'mel-autonomy',
    result_json: { bridge_preparation: { status: 'READY' } } };
  const request = new Request('https://mel.test/api/dev-bridge/precommit', {
    method: 'POST', headers: { authorization: 'Bearer valid-bridge-key', 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: job.id }),
  });
  const result = await devRuntime(request, { DB: db, MEL_DEV_BRIDGE_TOKEN: 'valid-bridge-key' },
    { repository: { get: async () => job } });
  assert.equal(result.status, 403, 'bearer must not impersonate cloud OIDC for publication');
  assert.equal((await result.json()).code, 'PRECOMMIT_OIDC_REQUIRED');
});

async function reportBridgeFailure(db, requester = 'mel-autonomy') {
  let job = { id: 'mel-autonomy-mel-audit-02-test-1', status: 'CLAIMED',
    requested_by: requester, tests_json: [], result_json: {},
    candidate_branch: 'candidate/mel-clean-autonomy' };
  const repository = {
    get: async id => id === job.id ? job : null,
    update: async (id, patch) => {
      assert.equal(id, job.id);
      job = { ...job, ...patch };
      return job;
    },
  };
  const response = await devRuntime(
    new Request('https://mel.test/api/dev-bridge/result', {
      method: 'POST', headers: {
        authorization: 'Bearer valid-bridge-key', 'content-type': 'application/json',
      },
      body: JSON.stringify({
        job_id: job.id, status: 'READY_FOR_REVIEW',
        tests_json: [{ name: 'full-regression', command: 'test', passed: false, exit_code: 1 }],
        diff_summary: 'REPAIR_REQUIRED:test-failure',
      }),
    }),
    { DB: db, MEL_DEV_BRIDGE_TOKEN: 'valid-bridge-key' },
    { repository },
  );
  return { response, job };
}

test('failed autonomous Bridge holds the mission stream and authorizes only its own repair', async t => {
  const { getAutonomyControl } = await import('../src/evolution/autonomy-control.js');
  const db = sqliteD1(); t.after(() => db.close());
  await setOwnerMaxAutonomy(db, {
    enabled: true, paused: false, source: 'owner-ui-launch-gate', reason: 'owner-max-autonomy',
  });
  const { response, job } = await reportBridgeFailure(db);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'REPAIR_REQUIRED');
  assert.equal(result.autonomy_pause?.confirmed, true);
  assert.equal(result.autonomy_pause?.status, 'REPAIR_ONLY');
  assert.equal(result.autonomy_pause?.scope, 'MISSION_STREAM');
  assert.equal(job.status, 'REPAIR_REQUIRED');
  const control = await getAutonomyControl(db);
  assert.equal(control.paused, false);
  assert.equal(control.max_autonomy, true);
  assert.equal(control.source, 'bridge-repair-lane');
  assert.equal(control.repair.job_id, job.id);
  assert.equal(control.repair.owner_control_version, control.owner_control_version);
});

test('an existing owner STOP remains the owner STOP after Bridge failure', async t => {
  const { getAutonomyControl } = await import('../src/evolution/autonomy-control.js');
  const db = sqliteD1(); t.after(() => db.close());
  const before = await setAutonomyControl(db, {
    paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop',
  });
  const { response } = await reportBridgeFailure(db);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).autonomy_pause?.confirmed, true);
  const after = await getAutonomyControl(db);
  assert.equal(after.source, 'owner-ui');
  assert.equal(after.reason, 'owner-stop');
  assert.equal(after.updated_at, before.updated_at);
});

test('failed owner-chat Bridge does not stop the independently running MAX lane', async t => {
  const { getAutonomyControl } = await import('../src/evolution/autonomy-control.js');
  const db = sqliteD1(); t.after(() => db.close());
  await setOwnerMaxAutonomy(db, {
    enabled: true, paused: false, source: 'owner-ui-launch-gate', reason: 'owner-max-autonomy',
  });
  const { response } = await reportBridgeFailure(db, 'owner-chat');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'REPAIR_REQUIRED');
  assert.equal((await getAutonomyControl(db)).paused, false);
  assert.equal((await getAutonomyControl(db)).max_autonomy, true);
});

test('after REPAIR_REQUIRED, the Bridge workflow never dispatches another roadmap tick', async () => {
  const { readFileSync } = await import('node:fs');
  const workflow = readFileSync(new URL('../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  const step = workflow.slice(workflow.indexOf('      - name: Continue autonomy after persisted bridge result'),
    workflow.indexOf('      - name: Upload sanitized apply evidence'));
  const beforeDispatch = step.slice(0, step.indexOf('actions/workflows/gen2-42-runtime-tick.yml/dispatches'));
  assert.match(beforeDispatch, /AUTONOMY_CHAIN_STOP_REPAIR_REQUIRED/);
  assert.match(beforeDispatch, /AUTONOMY_CHAIN_STOP_OWNER_PAUSED_OR_DISABLED/);
  assert.match(beforeDispatch, /AUTONOMY_CHAIN_STOP_OWNER_CONTROL_UNAVAILABLE/);
  assert.match(beforeDispatch, /AUTONOMY_CHAIN_STOP_NON_AUTONOMOUS_JOB/);
  assert.match(beforeDispatch, /r\.status==='READY_FOR_REVIEW'&&r\.needs_repair!==true/);
  assert.match(beforeDispatch, /v\.max_autonomy===true&&v\.paused===false/);
  assert.ok(beforeDispatch.indexOf('AUTONOMY_CHAIN_STOP_REPAIR_REQUIRED')
    < beforeDispatch.indexOf('actions/workflows/') || beforeDispatch.includes('AUTONOMY_CHAIN_STOP_REPAIR_REQUIRED'));
});
