import test from 'node:test';
import assert from 'node:assert/strict';
import { inferAutonomyControlIntent, isMaxModeMention } from '../src/evolution/chat-intent.js';
import { formatVerifiedAutonomyRuntimeResponse, MAX_MODE_EXPLANATION } from '../src/api/response-grounding.js';
import { MEL_REAL_CAPABILITIES } from '../src/api/native-chat.js';
import { maybeDispatchCloudBridge, CLOUD_BRIDGE_WORKFLOW } from '../src/evolution/cloud-bridge-dispatch.js';

test('questions about MAX go to the real autonomy status', () => {
  for (const q of ['C’est quoi le mode max ?', 'explique-moi ton mode MAX', 'le MAX te permet de te développer ?', 'comment fonctionne ton autonomie max']) {
    assert.deepEqual(inferAutonomyControlIntent(q), { id: 'autonomy.status', input: {} }, q);
  }
  // "max" as an ordinary word is not the mode.
  assert.equal(isMaxModeMention('réponds en 3 lignes max'), false);
  assert.equal(inferAutonomyControlIntent('réponds en 3 lignes max ?'), null);
});

test('MAX is described as real self-development, never as logging, and needs no secrets', () => {
  assert.match(MAX_MODE_EXPLANATION, /auto-développement autonome/);
  assert.match(MAX_MODE_EXPLANATION, /branche candidate/);
  assert.match(MAX_MODE_EXPLANATION, /déploie en production/);
  assert.match(MAX_MODE_EXPLANATION, /aucun token GitHub personnel, clé Stripe, webhook/);
  assert.ok(MEL_REAL_CAPABILITIES.includes(MAX_MODE_EXPLANATION));
  assert.match(MEL_REAL_CAPABILITIES, /Ne décris jamais MAX comme un simple mode verbeux/);
  const text = formatVerifiedAutonomyRuntimeResponse({ status: 'RUNNING', control: { max_autonomy: true, paused: false } }, { operation: 'status', explainMax: true });
  assert.match(text, /MAX est activé/);
  assert.ok(text.includes(MAX_MODE_EXPLANATION));
  const plain = formatVerifiedAutonomyRuntimeResponse({ status: 'RUNNING', control: { max_autonomy: true } }, { operation: 'status' });
  assert.ok(!plain.includes(MAX_MODE_EXPLANATION));
});

function fakeDb(rows = {}) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() {
          if (/bridge_id='primary'/.test(sql)) return rows.primary || null;
          if (/FROM dev_jobs WHERE id=\?/.test(sql)) return rows.package || null;
          if (/WHERE bridge_id=\?/.test(sql)) return rows[args[0]] || null;
          return null;
        },
        async run() { writes.push({ sql, args }); return {}; },
      };
      return stmt;
    },
  };
}

const readyTick = { bridge_preparation: { status: 'READY' }, job: { id: 'job-1', status: 'TEACHER_APPROVED' } };

test('MEL queues her own cloud bridge when a change is ready and the PC is offline', async () => {
  const db = fakeDb();
  const queued = [];
  const relay = { async enqueue(job) { queued.push(job); return { id: 'r1' }; } };
  const out = await maybeDispatchCloudBridge({ DB: db }, readyTick, { now: 1_000_000, relay });
  assert.equal(out.status, 'DISPATCH_QUEUED');
  assert.equal(queued[0].workflow, CLOUD_BRIDGE_WORKFLOW);
  assert.deepEqual(queued[0].inputs, { job_id: 'job-1', chain_depth: '0' });
  assert.equal(db.writes[0].args[0], 'cloud-bridge-dispatch:job-1');
});

test('no dispatch when not ready or dispatched recently', async () => {
  const relay = { async enqueue() { throw new Error('must not enqueue'); } };
  const now = 10_000_000;
  assert.equal((await maybeDispatchCloudBridge({ DB: fakeDb() }, { job: { id: 'j', status: 'WAITING_TEACHER' } }, { now, relay })).status, 'SKIPPED_NOT_READY');
  assert.equal((await maybeDispatchCloudBridge({ DB: fakeDb({ 'cloud-bridge-dispatch:job-1': { last_seen: now - 60_000 } }) }, readyTick, { now, relay })).status, 'SKIPPED_RECENTLY_DISPATCHED');
});

test('a package created after the last dispatch is sent without waiting 30 minutes', async () => {
  const now = 10_000_000;
  const db = fakeDb({
    'cloud-bridge-dispatch:job-1': { last_seen: now - 60_000 },
    package: { package_created_at: new Date(now - 30_000).toISOString() },
  });
  const queued = [];
  const out = await maybeDispatchCloudBridge({ DB: db }, readyTick, { now, relay: { async enqueue(job) { queued.push(job); return { id: 'r3' }; } } });
  assert.equal(out.status, 'DISPATCH_QUEUED');
  assert.equal(queued[0].inputs.job_id, 'job-1');
});

test('a READY package is dispatched even when the tick stopped before reporting it', async () => {
  const db = fakeDb();
  const prepare = db.prepare.bind(db);
  db.prepare = sql => (/json_extract\(result_json,'\$\.bridge_preparation.status'\)='READY'/.test(sql)
    ? { bind() { return this; }, async all() { return { results: [{
      id: 'job-d1', status: 'TEACHER_APPROVED',
      files_json: JSON.stringify([{ path: 'src/example.js', content: 'export const value=1;' }]),
      tests_json: JSON.stringify([{ command: 'test:smoke' }]),
      result_json: JSON.stringify({
        teacher_bridge: { status: 'ANSWERED', request: { request_id: 'teacher-d1' }, review: { request_id: 'teacher-d1', verdict: 'APPROVE_PLAN', development_allowed: true } },
        bridge_preparation: { status: 'READY', teacher_request_id: 'teacher-d1', candidate_branch: 'candidate/mel-clean-autonomy', candidate_sha: 'a'.repeat(40) },
        implementation_proposal: { status: 'READY' },
      }),
    }] }; } }
    : prepare(sql));
  const queued = [];
  const out = await maybeDispatchCloudBridge({ DB: db }, { status: 'NO_PROGRESS', job: { id: 'job-d1', status: 'TEACHER_APPROVED' } }, { now: 5_000_000, relay: { async enqueue(j) { queued.push(j); return { id: 'r2' }; } } });
  assert.equal(out.status, 'DISPATCH_QUEUED');
  assert.equal(queued[0].inputs.job_id, 'job-d1');
});

test('a release pause preserves MAX choice without promising recovery of an unverified release', () => {
  const text = formatVerifiedAutonomyRuntimeResponse({ status: 'PAUSED', control: { paused: true, max_autonomy: false, max_remembered: true, reason: 'predeploy-release-safety', source: 'release-predeploy-binder' } }, { operation: 'tick' });
  assert.match(text, /actif ou interrompu doit être vérifié/);
  const status = formatVerifiedAutonomyRuntimeResponse({status:'PAUSED',control:{paused:true,max_remembered:true,reason:'predeploy-release-safety',source:'release-predeploy-binder'}},{operation:'status'});
  assert.match(status, /MAX reste choisi/);
  assert.doesNotMatch(status, /reprendra à la fin/);
  assert.doesNotMatch(text, /MAX est désactivé/);
});

test('a finished release waiting for the owner is not described as a deploy still running', () => {
  const text = formatVerifiedAutonomyRuntimeResponse({ status: 'PAUSED', control: { paused: true, max_autonomy: false, source: 'release-launch-bootstrap', reason: 'NEW_RELEASE_AWAITING_OWNER_LAUNCH' } }, { operation: 'tick' });
  assert.match(text, /attend que le propriétaire active MAX/);
  assert.doesNotMatch(text, /mise en production est en cours/);
});

test('MAX status answers name the real job, its waiting step and the guard state', () => {
  const text = formatVerifiedAutonomyRuntimeResponse({
    status: 'READY', control: { paused: false, max_autonomy: true },
    work: {
      watchdog: { status: 'STALLED', tripped: true, consecutive_stalls: 45, last_block_reason: 'NO_ZERO_COST_PROVIDER_AVAILABLE' },
      active_jobs: [{ id: 'ecosystem-watch-88b5', origin: 'veille des capacités', status_text: 'Plan validé ; code écrit puis paquet préparé pour le pont cloud.', current_step: 'Appliqué sur la candidate', done_steps: ['Chantier choisi', 'Plan validé (par MAX)', 'Code écrit', 'Paquet prêt pour le pont'], idle_minutes: 12, diagnostics: [], error: null }],
      last_cloud_bridge_dispatch: { job_id: 'ecosystem-watch-88b5', at: Date.UTC(2026, 9, 18, 12, 30) },
    },
  }, { operation: 'status' });
  assert.match(text, /STALLED \(bloqué après 45 cycles/);
  assert.match(text, /Étape en attente : Appliqué sur la candidate/);
  assert.match(text, /Dernier pont cloud demandé .* 12:30 UTC/);
  assert.match(MEL_REAL_CAPABILITIES, /N’invente jamais de fonction, d’endpoint, de flag/);
});

test('[GPT] online Companion heartbeat does not indefinitely hide an unclaimed READY package', async () => {
  const now = 20_000_000;
  const db = fakeDb({
    primary: { last_seen: now - 2_000, status: 'ONLINE' },
    package: { package_created_at: new Date(now - 240_000).toISOString() },
  });
  const queued = [];
  const output = await maybeDispatchCloudBridge({ DB: db }, readyTick, {
    now,
    relay: { async enqueue(job) { queued.push(job); return { id: 'gpt-companion-fallback' }; } },
  });
  assert.equal(output.status, 'DISPATCH_QUEUED');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].inputs.job_id, 'job-1');
});

test('[CODEX] recent READY package goes to cloud even with an online Companion', async () => {
  const now = 20_000_000;
  const db = fakeDb({
    primary: { last_seen: now - 2_000, status: 'ONLINE' },
    package: { package_created_at: new Date(now - 30_000).toISOString() },
  });
  const output = await maybeDispatchCloudBridge({ DB: db }, readyTick, {
    now, relay: { async enqueue() { return { id: 'cloud-first-relay' }; } },
  });
  assert.equal(output.status, 'DISPATCH_QUEUED');
});
