// CODEX: cloud-first admission; real SQLite claims, no external mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { maybeDispatchCloudBridge } from '../src/evolution/cloud-bridge-dispatch.js';
import { runCouncilReview, PC_AFTER_ATTEMPTS } from '../src/evolution/council-review.js';
import { devRuntime } from '../src/dev/runtime-api.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { D1GitHubActionRelayStore } from '../src/platform/github-action-relay.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime-core.js';
import { prepareApprovedImplementationProposal } from '../src/evolution/autonomy-implementation-planner.js';

async function fixture(t) {
  const DB = sqliteD1();
  t.after(() => DB.close());
  const repository = new D1DevJobRepository(DB);
  const job = await repository.create({ id: 'cloud-first-job', requested_by: 'mel-autonomy', goal: 'Bounded cloud development', optional_context: { roadmap_id: 'MEL-WORK-01' } });
  const prepared = await repository.update(job.id, {
    status: 'TEACHER_APPROVED',
    files_json: [{ path: 'src/value.js', content: 'export const value=2;' }],
    tests_json: [{ command: 'test:smoke' }],
    result_json: {
      teacher_bridge: { status: 'ANSWERED', request: { request_id: 'teacher' }, review: { request_id: 'teacher', verdict: 'APPROVE_PLAN', development_allowed: true } },
      implementation_proposal: { status: 'READY' },
      bridge_preparation: { status: 'READY', teacher_request_id: 'teacher', candidate_branch: 'candidate/mel-clean-autonomy', candidate_sha: 'a'.repeat(40), created_at: new Date().toISOString() },
    },
  });
  return { DB, repository, job: prepared };
}

for (const online of [true, false]) test(`cloud dispatch starts immediately with PC online=${online}, and a queue receipt is not execution`, async t => {
  const { DB, repository, job } = await fixture(t);
  if (online) await DB.prepare("INSERT INTO dev_bridge_state VALUES('primary',?,'ONLINE','{}')").bind(Date.now()).run();
  let count = 0;
  const result = await maybeDispatchCloudBridge({ DB }, {}, { relay: { async enqueue() { count++; return { id: 'relay-receipt' }; } } });
  assert.equal(result.status, 'DISPATCH_QUEUED');
  assert.equal(count, 1);
  const persisted = await repository.get(job.id);
  assert.equal(persisted.status, 'TEACHER_APPROVED');
  assert.equal(persisted.result_json.autonomy_completion, undefined);
});

test('unavailable cloud persists an explicit failure without consuming the package', async t => {
  const { DB, repository, job } = await fixture(t);
  const result = await maybeDispatchCloudBridge({ DB }, {}, { relay: { async enqueue() { throw new Error('PRIVATE_TRANSPORT_DETAIL'); } } });
  assert.equal(result.status, 'CLOUD_UNAVAILABLE');
  const state = await DB.prepare('SELECT status,metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind('cloud-bridge-dispatch:' + job.id).first();
  assert.equal(state.status, 'CLOUD_UNAVAILABLE');
  assert.ok(!state.metadata_json.includes('PRIVATE_TRANSPORT_DETAIL'));
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED');

});

test('a persisted failed GitHub dispatch is observed without pretending execution occurred', async t => {
  const { DB, repository, job } = await fixture(t);
  const store = new D1GitHubActionRelayStore(DB);
  const queued = await maybeDispatchCloudBridge({ DB }, {}, { relay: store });
  await store.complete(queued.relay_job_id, { status: 'FAILED', error: 'GITHUB_UNAVAILABLE' });
  const result = await maybeDispatchCloudBridge({ DB }, {}, { relay: store });
  assert.equal(result.status, 'CLOUD_UNAVAILABLE');
  assert.equal(result.code, 'CLOUD_RELAY_DISPATCH_FAILED');
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED');
});

test('online Council never contacts PC, even after previous exhausted attempts', async () => {
  let pc = 0;
  const result = await runCouncilReview({ AI: { async run() { return { response: '{"verdict":"APPROVE","summary":"reviewed"}' }; } } }, {
    diff: '+tested', attempts: PC_AFTER_ATTEMPTS,
    companion: async () => { pc++; throw new Error('PC must not be queried'); },
  });
  assert.equal(result.decision, 'APPROVED');
  assert.equal(pc, 0);
});

test('exhausting online Council attempts does not authorize PC inference', async () => {
  let pc = 0;
  const result = await runCouncilReview({ AI: { async run() { throw new Error('DOWN'); } } }, {
    diff: '+tested', attempts: PC_AFTER_ATTEMPTS,
    companion: async () => { pc++; return { invoke: async () => ({ text: '{"verdict":"APPROVE","summary":"pc"}' }) }; },
  });
  assert.equal(result.decision, 'COUNCIL_UNAVAILABLE');
  assert.equal(pc, 0);
});

async function localClaim(env, repository, id) {
  return devRuntime(new Request('https://mel.invalid/api/dev-bridge/claim', {
    method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify({ job_id: id }),
  }), { ...env, MEL_DEV_BRIDGE_TOKEN: 'fixture' }, { repository });
}

test('local bearer cannot take normal cloud work without owner fallback authorization', async t => {
  const { DB, repository, job } = await fixture(t);
  const response = await localClaim({ DB }, repository, job.id);
  assert.equal(response.status, 409);
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED');
});

test('owner opt-in alone cannot divert available cloud work to Windows', async t => {
  const { DB, repository, job } = await fixture(t);
  const response = await localClaim({ DB, MEL_COMPANION_FALLBACK_ALLOWED: 'true' }, repository, job.id);
  assert.equal(response.status, 409);
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED');
});

test('fresh scoped cloud failure plus owner opt-in admits one atomic local fallback only', async t => {
  const { DB, repository, job } = await fixture(t);
  const prep = job.result_json.bridge_preparation;
  await DB.prepare('INSERT INTO dev_bridge_state VALUES(?,?,?,?)')
    .bind('cloud-bridge-dispatch:' + job.id, Date.now(), 'CLOUD_UNAVAILABLE', JSON.stringify({ package_created_at: prep.created_at, candidate_sha: prep.candidate_sha })).run();
  const env = { DB, MEL_COMPANION_FALLBACK_ALLOWED: 'true' };
  const [a, b] = await Promise.all([localClaim(env, repository, job.id), localClaim(env, repository, job.id)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(await repository.claimPrepared(job.id), null, 'cloud cannot double-claim the executor-owned package');
});

for (const invalid of ['stale', 'wrong-base', 'wrong-package']) test(`local fallback rejects ${invalid} cloud failure evidence`, async t => {
  const { DB, repository, job } = await fixture(t);
  const prep = job.result_json.bridge_preparation;
  await DB.prepare('INSERT INTO dev_bridge_state VALUES(?,?,?,?)')
    .bind('cloud-bridge-dispatch:' + job.id, Date.now() - (invalid === 'stale' ? 31 * 60_000 : 0), 'CLOUD_UNAVAILABLE', JSON.stringify({
      package_created_at: invalid === 'wrong-package' ? '2000-01-01T00:00:00Z' : prep.created_at,
      candidate_sha: invalid === 'wrong-base' ? 'b'.repeat(40) : prep.candidate_sha,
    })).run();
  const response = await localClaim({ DB, MEL_COMPANION_FALLBACK_ALLOWED: true }, repository, job.id);
  assert.equal(response.status, 409);
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED');
});

test('a provider-deferred job persists across MAX restart without spawning independent work', async t => {
  const { repository, job } = await fixture(t);
  await repository.update(job.id, { result_json: {
    ...job.result_json, autonomy_deferral: { code: 'COUNCIL_UNAVAILABLE', retry_after: Date.now() + 60_000 },
  } });
  const roadmap = [
    { id: 'MEL-WORK-01', title: 'Deferred', status: 'PARTIAL', priority: 'P0' },
    { id: 'GEN2-17', title: 'Independent', status: 'PLANNED', priority: 'P0' },
  ];
  const restarted = new AutonomySupervisor({ repository, roadmap });
  const next = await restarted.ensureNextJob();
  assert.equal(next.created, false);
  assert.equal(next.external_progress?.job_id || next.job?.id, job.id);
  assert.equal((await repository.list()).filter(row => row.requested_by === 'mel-autonomy').length, 1);
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED');
  const firstCount = (await repository.list()).length;
  await new AutonomySupervisor({ repository, roadmap }).ensureNextJob();
  assert.equal((await repository.list()).length, firstCount, 'MAX restart does not create another objective');
  const latest = await repository.get(job.id);
  await repository.update(job.id, { result_json: { ...latest.result_json, autonomy_deferral: { code: 'COUNCIL_UNAVAILABLE', retry_after: Date.now() - 1 } } });
  assert.equal((await new AutonomySupervisor({ repository, roadmap }).ensureNextJob()).job.id, job.id, 'expired delay resumes the same nonterminal job');
});

test('cloud-first lesson reaches MEL once through its real LearningEngine', async () => {
  const { LearningEngine } = await import('../src/learning/learning-engine.js');
  const engine = new LearningEngine({ memory: { async recent() { return []; } } });
  const id = 'codex-cloud-first-owner-fallback-20261021';
  assert.equal((await engine.corrections({ limit: 1000 })).filter(row => row.id === id).length, 1);
  assert.ok((await engine.trainingBundle({ minQuality: 0.95, limit: 1000 })).preference.some(row => row.id === id));
});

test('real runtime records unavailable implementation providers before selecting other work', async t => {
  const { DB, repository, job } = await fixture(t);
  const result = structuredClone(job.result_json);
  result.teacher_bridge.request.candidate = { branch: 'candidate/mel-clean-autonomy', sha: 'a'.repeat(40) };
  result.teacher_bridge.evidence = { candidate_sha: 'a'.repeat(40), inspection_files: ['src/value.js'] };
  await repository.update(job.id, { result_json: result });
  const env = { DB, MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy', MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy' };
  const fetchImpl = async url => String(url).includes('/commits/')
    ? Response.json({ sha: 'a'.repeat(40) })
    : String(url).includes('api.github.com') ? new Response('fixture API fallback', { status: 403 })
    : new Response(String(url).includes('raw.githubusercontent.com') && !String(url).includes('teacher-bridge/') ? 'export const value=1;\n' : '', { status: 200 });
  const roadmap = [{ id: 'MEL-WORK-01', title: 'Unavailable provider', status: 'PARTIAL', priority: 'P0' }];
  await assert.rejects(prepareApprovedImplementationProposal({ env, repository, job, fetchImpl }), { name: 'TypeError', message: 'WORKERS_AI_BINDING_UNAVAILABLE' });
  const tick = await runAutonomyRuntimeTick(env, { repository, roadmap, epochMs: 0, fetchImpl });
  assert.equal(tick.implementation?.code, 'WORKERS_AI_BINDING_UNAVAILABLE');
  const persisted = await repository.get(job.id);
  assert.equal(persisted.status, 'TEACHER_APPROVED');
  assert.equal(persisted.result_json.autonomy_deferral.code, 'WORKERS_AI_BINDING_UNAVAILABLE');
  assert.ok(persisted.result_json.autonomy_deferral.retry_after > Date.now());
  assert.equal(persisted.result_json.autonomy_completion, undefined);
});


// [ChatGPT-GPT6 / MEL-CODE-DISPATCH-CAS] Two MAX ticks must not enqueue
// duplicate GitHub actions for an identical approved D1 package.
test('concurrent MAX cloud dispatch is idempotent for the same approved package', async t => {
  const { DB, repository, job } = await fixture(t);
  let enqueues = 0;
  const relay = {
    async enqueue() {
      enqueues += 1;
      await new Promise(resolve => setImmediate(resolve));
      return { id: 'concurrent-relay-' + enqueues };
    },
  };
  const now = Date.now() + 1000;
  const results = await Promise.all([
    maybeDispatchCloudBridge({ DB }, {}, { now, relay }),
    maybeDispatchCloudBridge({ DB }, {}, { now, relay }),
    maybeDispatchCloudBridge({ DB }, {}, { now, relay }),
  ]);
  assert.equal(enqueues, 1, 'only one cloud relay job should be enqueued');
  assert.equal(results.filter(result => result.status === 'DISPATCH_QUEUED').length, 1);
  assert.equal(results.filter(result => result.status === 'SKIPPED_RECENTLY_DISPATCHED').length, 2);
  const state = await DB.prepare('SELECT status,metadata_json FROM dev_bridge_state WHERE bridge_id=?')
    .bind('cloud-bridge-dispatch:' + job.id).first();
  assert.equal(state.status, 'QUEUED');
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED', 'an enqueue is not execution');
});


// [ChatGPT-GPT6 / MEL-CODE-CAS-RECOVERY] Exercise the persisted relay itself,
// not just a test spy. One queued receipt is NOT a tested candidate commit.
test('parallel MAX ticks create exactly one durable cloud relay row', async t => {
  const { DB, repository, job } = await fixture(t);
  const store = new D1GitHubActionRelayStore(DB);
  const now = Date.now() + 1000;
  const results = await Promise.all(
    Array.from({ length: 5 }, () => maybeDispatchCloudBridge({ DB }, {}, { now, relay: store })),
  );
  const count = await DB.prepare("SELECT COUNT(*) AS n FROM github_action_relay_jobs WHERE workflow=?")
    .bind('gen2-42-apply-ready-bridge.yml').first();
  assert.equal(Number(count.n), 1);
  assert.equal(results.filter(row => row.status === 'DISPATCH_QUEUED').length, 1);
  assert.equal((await repository.get(job.id)).status, 'TEACHER_APPROVED');
  assert.equal((await repository.get(job.id)).result_json.autonomy_completion, undefined);
});

test('a newly approved candidate package supersedes old cloud dispatch reservation once', async t => {
  const { DB, repository, job } = await fixture(t);
  const store = new D1GitHubActionRelayStore(DB);
  const now = Date.now() + 1000;
  const first = await maybeDispatchCloudBridge({ DB }, {}, { now, relay: store });
  assert.equal(first.status, 'DISPATCH_QUEUED');
  const current = await repository.get(job.id);
  const next = {
    ...current.result_json,
    bridge_preparation: {
      ...current.result_json.bridge_preparation,
      created_at: new Date(now + 1000).toISOString(),
      candidate_sha: 'b'.repeat(40),
    },
  };
  await repository.update(job.id, { result_json: next }, { expected: current });
  const second = await maybeDispatchCloudBridge({ DB }, {}, { now: now + 1001, relay: store });
  assert.equal(second.status, 'DISPATCH_QUEUED', 'new approved SHA does not inherit old cooldown');
  assert.notEqual(second.relay_job_id, first.relay_job_id);
  const duplicate = await maybeDispatchCloudBridge({ DB }, {}, { now: now + 1002, relay: store });
  assert.equal(duplicate.status, 'SKIPPED_RECENTLY_DISPATCHED');
  const count = await DB.prepare("SELECT COUNT(*) AS n FROM github_action_relay_jobs WHERE workflow=?")
    .bind('gen2-42-apply-ready-bridge.yml').first();
  assert.equal(Number(count.n), 2, 'one immutable receipt per approved package revision');
});


// [ChatGPT-GPT6 / MEL-CODE-SECOND-READY] A recently dispatched job must not
// monopolize the dispatcher when MAX has another independent approved job.
test('a second approved MAX job is dispatched while the first awaits its cloud relay', async t => {
  const { DB, repository, job } = await fixture(t);
  const store = new D1GitHubActionRelayStore(DB);
  const now = Date.now() + 1000;
  assert.equal((await maybeDispatchCloudBridge({ DB }, {}, { now, relay: store })).status, 'DISPATCH_QUEUED');

  const independent = await repository.create({
    id: 'second-cloud-job', requested_by: 'mel-autonomy', goal: 'Second independent approved job',
  });
  const source = job.result_json;
  await repository.update(independent.id, {
    status: 'TEACHER_APPROVED',
    files_json: [{ path: 'src/second.js', content: 'export const second = true;' }],
    tests_json: [{ command: 'test:smoke' }],
    result_json: {
      ...source,
      bridge_preparation: {
        ...source.bridge_preparation, created_at: new Date(now + 1).toISOString(),
      },
    },
  });
  const second = await maybeDispatchCloudBridge({ DB }, {}, { now: now + 2, relay: store });
  assert.equal(second.status, 'DISPATCH_QUEUED');
  const queued = await DB.prepare("SELECT inputs_json FROM github_action_relay_jobs ORDER BY created_at ASC").all();
  assert.equal(queued.results.length, 2);
  const ids = queued.results.map(row => JSON.parse(row.inputs_json).job_id).sort();
  assert.deepEqual(ids, [job.id, independent.id].sort());
});
