import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { recoverNoopReview } from '../src/evolution/noop-review-recovery.js';
import { roadmapContractRevision } from '../src/roadmap/roadmap-code-contracts.js';
import { packageContentFingerprint } from '../src/evolution/council-rejected-package.js';
const sha = 'a'.repeat(40);
const files = JSON.parse(fs.readFileSync('prepared/MEL-MANIFEST-01.json', 'utf8')).changes;
async function fixture(db = null) {
  const repository = new D1DevJobRepository(db, { memoryStore: new Map() });
  const created = await repository.create({ id: 'manifest-noop', requested_by: 'mel-autonomy',
    goal: '[MEL-MANIFEST-01] Compter les priorités', optional_context: {
      roadmap_id: 'MEL-MANIFEST-01', roadmap_contract_revision: roadmapContractRevision('MEL-MANIFEST-01') } });
  const job = await repository.update(created.id, { status: 'READY_FOR_REVIEW', files_json: files,
    result_json: {
      runtime_retry: { attempts: 2 }, teacher_bridge: { status: 'ANSWERED', review: { verdict: 'APPROVE_PLAN', development_allowed: true } },
      bridge_preparation: { candidate_sha: sha }, implementation_proposal: { candidate_sha: sha },
      dev_bridge: { status: 'READY_FOR_REVIEW', needs_repair: false, tests: [{ command: 'test', passed: true, executed: true }] },
    } });
  const control = { max_autonomy: true, paused: false, updated_at: 1, owner_control_version: 1 };
  const reads = [];
  return { env: {}, repository, job, control, reads, readControl: async () => control,
    readFile: async (path, base) => { reads.push({ path, base }); return files.find(file => file.path === path).content; } };
}

test('original snapshot no-op is requeued once without completing, duplicating or resetting attempts', async () => {
  const f = await fixture();
  const updated = await recoverNoopReview(f);
  assert.equal(updated.status, 'QUEUED');
  assert.equal(updated.id, f.job.id);
  assert.equal(updated.goal, f.job.goal);
  assert.equal(updated.result_json.runtime_retry.attempts, 2);
  assert.equal(updated.result_json.implementation_proposal, undefined);
  assert.equal(updated.result_json.noop_review_recovery.previous.dev_bridge.status, 'READY_FOR_REVIEW');
  assert.deepEqual(f.reads.map(row => row.base), [sha, sha]);
  assert.equal(await recoverNoopReview({ ...f, job: { ...updated, status: 'READY_FOR_REVIEW' } }), null);
});

test('real patch, owner stop, rejection, unexecuted tests and pending review remain untouched', async () => {
  for (const scenario of ['patch', 'stop', 'rejected', 'test', 'review', 'drift']) {
    const f = await fixture();
    if (scenario === 'patch') f.readFile = async () => 'original different code';
    if (scenario === 'stop') f.control.paused = true;
    if (scenario === 'rejected') f.job.result_json.council_rejected_packages = [{ schema: 'mel.council-rejected-package/v1', content_sha256: await packageContentFingerprint(files) }];
    if (scenario === 'test') f.job.result_json.dev_bridge.tests[0].executed = false;
    if (scenario === 'review') f.job.result_json.council_review = { status: 'PENDING' };
    if (scenario === 'drift') { let n = 0; f.readControl = async () => ({ ...f.control, updated_at: ++n }); }
    assert.equal(await recoverNoopReview(f), null, scenario);
    assert.equal((await f.repository.get(f.job.id)).status, 'READY_FOR_REVIEW');
  }
});

test('a concurrent cancellation stays terminal while inspecting original files', async () => {
  const f = await fixture();
  const read = f.readFile;
  f.readFile = async (...args) => {
    await f.repository.update(f.job.id, { status: 'CANCELLED' });
    return read(...args);
  };
  assert.equal(await recoverNoopReview(f), null);
  assert.equal((await f.repository.get(f.job.id)).status, 'CANCELLED');
});

test('real SQL recovery reads immutable GitHub snapshot and retains the same durable mission', async () => {
  const db = sqliteD1();
  try {
    const f = await fixture(db);
    const urls = [];
    delete f.readFile;
    f.fetchImpl = async url => {
      urls.push(String(url));
      const file = files.find(row => String(url).endsWith('/' + row.path));
      assert.ok(String(url).includes('/' + sha + '/'), 'never compare only the mutable branch head');
      return new Response(file.content);
    };
    const result = await recoverNoopReview(f);
    assert.equal(result.status, 'QUEUED');
    assert.ok(urls.length >= 2);
    for (const file of files) assert.ok(urls.some(url => url.endsWith('/' + file.path)));
    assert.equal((await f.repository.get(f.job.id)).result_json.runtime_retry.attempts, 2);
  } finally { db.close(); }
});
