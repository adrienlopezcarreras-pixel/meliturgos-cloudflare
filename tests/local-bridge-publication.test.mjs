// CODEX: reproduce local apply/test -> durable result -> missing GitHub publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository, isUnappliedReadyReviewJob } from '../src/dev/d1-dev-job-repository.js';
import { LocalDevBridge } from '../src/dev/dev-bridge.js';
import { runStructuredBridgeJob } from '../src/dev/bridge-job-runner.js';
import { mergeBridgeResult } from '../src/dev/runtime-api.js';
import { readyJobFromD1, maybeDispatchCloudBridge } from '../src/evolution/cloud-bridge-dispatch.js';

async function prepared(repo, sha, id = 'local-publication-proof') {
  const requestId = 'teacher-' + id;
  await repo.create({ id, requested_by: 'mel-autonomy', goal: 'Correct an approved value and execute its actual test.' });
  return repo.update(id, { status: 'TEACHER_APPROVED', candidate_branch: 'candidate/mel-clean-autonomy',
    files_json: [{ path: 'src/value.js', content: 'export const value = 2;\n' }],
    tests_json: [{ name: 'smoke', command: 'test:smoke' }], result_json: {
      teacher_bridge: { status: 'ANSWERED', request: { request_id: requestId },
        review: { request_id: requestId, verdict: 'APPROVE_PLAN', development_allowed: true } },
      implementation_proposal: { status: 'READY' },
      bridge_preparation: { status: 'READY', teacher_request_id: requestId,
        candidate_branch: 'candidate/mel-clean-autonomy', candidate_sha: sha,
        created_at: new Date().toISOString(), files: ['src/value.js'], tests: ['smoke'] },
    } });
}

test('real local edits and npm tests can reach the existing publication relay once, while the PC stays ONLINE', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mel-codex-local-publication-'));
  const DB = sqliteD1();
  const repo = new D1DevJobRepository(DB);
  try {
    await mkdir(join(dir, 'src'));
    await mkdir(join(dir, 'tests'));
    await writeFile(join(dir, 'src/value.js'), 'export const value = 1;\n');
    await writeFile(join(dir, 'tests/value.test.mjs'), "import assert from 'node:assert/strict';import {value} from '../src/value.js';assert.equal(value,2);\n");
    await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module', scripts: { 'test:smoke': 'node --test tests/value.test.mjs' } }));
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q'); git('config', 'user.name', 'CODEX test'); git('config', 'user.email', 'codex-test@example.invalid');
    git('checkout', '-qb', 'candidate/mel-clean-autonomy'); git('add', '.'); git('commit', '-qm', 'fixture');
    const sha = git('rev-parse', 'HEAD');
    await prepared(repo, sha);
    const claimed = await repo.claim();
    const bridge = new LocalDevBridge({ repoRoot: dir });
    const local = await runStructuredBridgeJob({ bridge, job: claimed });
    assert.equal(local.status, 'READY_FOR_REVIEW');
    assert.equal(local.needs_repair, false);
    assert.equal(local.result_json.changed, true);
    assert.equal(local.tests_json[0].exit_code, 0);
    assert.equal(await readFile(join(bridge.candidate(claimed.id).dir, 'src/value.js'), 'utf8'), 'export const value = 2;\n');
    assert.equal(await readFile(join(dir, 'src/value.js'), 'utf8'), 'export const value = 1;\n', 'the owner checkout stays untouched');
    const stored = await repo.update(claimed.id, { status: local.status, tests_json: local.tests_json,
      result_json: mergeBridgeResult(claimed, local) });
    assert.equal(stored.result_json.dev_bridge.candidate_sha, undefined, 'local apply/test is not a published canonical commit');
    assert.equal(isUnappliedReadyReviewJob(stored), true);
    assert.equal((await readyJobFromD1(DB))?.id, claimed.id);
    const now = Date.now();
    await DB.prepare("INSERT OR REPLACE INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES('primary',?,'ONLINE','{}')").bind(now).run();
    const dispatched = await maybeDispatchCloudBridge({ DB }, {}, { now });
    assert.equal(dispatched.status, 'DISPATCH_QUEUED');
    assert.equal((await maybeDispatchCloudBridge({ DB }, {}, { now: now + 1 })).status, 'SKIPPED_RECENTLY_DISPATCHED');
    const publishing = await repo.claimPrepared(claimed.id);
    assert.equal(publishing.status, 'CLAIMED');
    assert.equal(await repo.claimPrepared(claimed.id), null, 'publication uses the existing atomic claim');
    const published = { status: 'READY_FOR_REVIEW', result_json: { mode: 'GITHUB_CLOUD_BRIDGE',
      changed: true, candidate_sha: 'b'.repeat(40), tests: local.tests_json, needs_repair: false } };
    const done = await repo.update(claimed.id, { status: 'READY_FOR_REVIEW', result_json: mergeBridgeResult(publishing, published) });
    assert.equal(done.result_json.dev_bridge_history.some(row => row.mode === 'STRUCTURED_MENTOR_WORK'), true);
    assert.equal(await readyJobFromD1(DB), null, 'a canonical commit must never be republished');
  } finally { DB.close(); await rm(dir, { recursive: true, force: true }); }
});

test('publication refuses failed tests, missing Teacher, unrelated bases, already published or terminal missions', async () => {
  const repo = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await prepared(repo, 'a'.repeat(40));
  const valid = { ...job, status: 'READY_FOR_REVIEW', result_json: { ...job.result_json, dev_bridge: {
    mode: 'STRUCTURED_MENTOR_WORK', changed: true, needs_repair: false, production_touched: false,
    approved_base: { candidate_branch: 'candidate/mel-clean-autonomy', candidate_sha: 'a'.repeat(40) },
    applied_files: ['src/value.js'], tests: [{ name: 'smoke', command: 'test:smoke', passed: true, exit_code: 0 }],
  } } };
  assert.equal(isUnappliedReadyReviewJob(valid), true);
  const mutations = [
    value => { value.result_json.dev_bridge.tests[0].passed = false; },
    value => { value.result_json.dev_bridge.tests = []; },
    value => { value.result_json.dev_bridge.approved_base.candidate_sha = 'c'.repeat(40); },
    value => { value.result_json.teacher_bridge.review.development_allowed = false; },
    value => { value.result_json.dev_bridge.candidate_sha = 'b'.repeat(40); },
    value => { value.status = 'CANCELLED'; },
    value => { value.status = 'FAILED'; },
  ];
  for (const change of mutations) {
    const value = structuredClone(valid); change(value);
    assert.equal(isUnappliedReadyReviewJob(value), false);
  }
});

// CODEX: the reusable correction must reach MEL's existing learning corpus.
test('local publication lesson reaches the LearningEngine without duplicate IDs', async () => {
  const { LearningEngine } = await import('../src/learning/learning-engine.js');
  const engine = new LearningEngine({ memory: { async recent() { return []; } } });
  const id = 'codex-local-bridge-publication-evidence-20261021';
  const corrections = await engine.corrections({ limit: 1000 });
  assert.equal(corrections.filter(row => row.id === id).length, 1);
  const bundle = await engine.trainingBundle({ minQuality: 0.95, limit: 1000 });
  assert.ok(bundle.preference.some(row => row.id === id));
});
