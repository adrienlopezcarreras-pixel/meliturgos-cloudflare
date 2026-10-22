import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MentorEngine } from '../src/learning/mentor-engine.js';
import { assertMentorCodeContract } from '../src/learning/mentor-code-contract.js';
import { reconcileFailedCandidateRuns } from '../src/teachers/github-completion-reconciler.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const path = 'src/work/work-dag.js';
const original = await readFile(new URL('../src/work/work-dag.js', import.meta.url), 'utf8');
// Exact body published by the cloud bridge in 43f1742c2269357357c2b563291f2a8df26074cd.
const destructive = await readFile(new URL('./fixtures/mentor/destructive-work-dag.txt', import.meta.url), 'utf8');
const SHA = 'a'.repeat(40), BASE = 'b'.repeat(40), BRANCH = 'candidate/mel-clean-autonomy';
function engineFor(answer, calls = []) {
  return new MentorEngine({ providerFactory: async () => [{ id: 'controlled-provider', providerId: 'fixture', modelId: 'fixture',
    async invoke(request) { calls.push(request); return { text: JSON.stringify(answer) }; } }] });
}

for (const reason of ['replacement', 'Modification appliquée sur le fichier inspecté']) {
  test(`actual destructive DAG replacement cannot forge edit provenance: ${reason}`, async () => {
    await assert.rejects(engineFor({ changes: [{ path, content: destructive, reason }] }).propose({
      env: {}, goal: 'Resume persistent work safely', inspectedFiles: [{ path, content: original }],
    }), error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL'
      && error.failures.every(row => row.error === 'MENTOR_LONG_FILE_REQUIRES_EDIT'));
  });
}

test('export removal hidden in a syntactically valid exact edit is rejected', async () => {
  const source = 'export const keep = 1;\nexport const change = 0;\n';
  await assert.rejects(engineFor({ edits: [{ path, find: 'export const keep = 1;', replace: '// export const keep = 1;' }] })
    .propose({ env: {}, goal: 'Preserve public contracts', inspectedFiles: [{ path, content: source }] }),
  error => error.failures.every(row => row.error === 'MENTOR_EXPORT_CONTRACT_REMOVED'));
});

test('parser refuses invalid code and preserves exported class methods, aliases and destructuring', () => {
  assert.throws(() => assertMentorCodeContract(path, 'export const x=1;', 'export const x='), /MENTOR_CODE_SYNTAX_INVALID/);
  assert.throws(() => assertMentorCodeContract(path, 'export class Store { save() {} load() {} }', 'export class Store { save() {} }'), /MENTOR_CLASS_CONTRACT_REMOVED/);
  assert.throws(() => assertMentorCodeContract(path, 'const a=1; export {a as publicName};', 'export const a=1;'), /MENTOR_EXPORT_CONTRACT_REMOVED/);
  assert.throws(() => assertMentorCodeContract(path, 'export const { a, b } = value;', 'export const a=1;'), /MENTOR_EXPORT_CONTRACT_REMOVED/);
});

test('an uninspected path without imports also fails closed', async () => {
  await assert.rejects(engineFor({ changes: [{ path: 'src/unread.js', content: 'export const safeLooking = true;' }] })
    .propose({ env: {}, goal: 'Read before writing', inspectedFiles: [{ path, content: original }] }),
  error => error.failures.every(row => row.error === 'MENTOR_UNINSPECTED_PATH'));
});

test('controlled Mentor repair sees historical reference but edits the current defective source', async () => {
  const calls = [];
  const result = await engineFor({ edits: [{ path, find: destructive.trim(), replace: original.trim() }], tests: ['test'], summary: 'Restore contracts on the inspected candidate.' }, calls)
    .propose({ env: {}, goal: 'Repair the candidate without declaring completion', mode: 'repair',
      inspectedFiles: [{ path, content: destructive }], repairReferences: [{ path, content: original }] });
  assert.match(calls[0].input, /REFERENCE src\/work\/work-dag.js/);
  assert.match(result.proposal.changes[0].content, /export class DevJobWorkDagStore/);
  assert.doesNotThrow(() => assertMentorCodeContract(path, original, result.proposal.changes[0].content));
  assert.equal(result.proposal.provenance.provider, 'fixture');
  assert.equal(result.mode, 'repair');
});

test('repair may not retain a truncated contract just because the current broken source lacks it', async () => {
  await assert.rejects(engineFor({ edits: [{ path, find: 'options.goal', replace: 'String(options.goal)' }] })
    .propose({ env: {}, goal: 'Repair', mode: 'repair', inspectedFiles: [{ path, content: destructive }], repairReferences: [{ path, content: original }] }),
  error => error.failures.every(row => row.error === 'MENTOR_EXPORT_CONTRACT_REMOVED'));
});

async function publishedJob(repository, id = 'published') {
  const job = await repository.create({ id, requested_by: 'mel-autonomy', goal: 'Persistent progress' });
  return repository.update(id, { status: 'READY_FOR_REVIEW', result_json: {
    teacher_bridge: { status: 'ANSWERED', request: { request_id: id }, review: { request_id: id, verdict: 'APPROVE_PLAN', development_allowed: true } },
    bridge_preparation: { status: 'READY', teacher_request_id: id, candidate_branch: BRANCH, candidate_sha: BASE },
    dev_bridge: { status: 'READY_FOR_REVIEW', candidate_sha: SHA, tests: [{ name: 'smoke', passed: true }] },
    concurrentEvidence: 'must survive',
  } });
}
function ciFetch({ head = SHA, conclusion = 'failure', status = 'completed', runSha = SHA, branch = BRANCH, http = 200, beforeReply } = {}) {
  return async url => {
    if (beforeReply) await beforeReply();
    if (http !== 200) return new Response('unavailable', { status: http });
    return Response.json(String(url).includes('/commits/') ? { sha: head } : { workflow_runs: [{ id: 11, name: 'full-candidate-ci', head_sha: runSha, head_branch: branch, status, conclusion }] });
  };
}
const env = { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH };

test('red exact candidate CI feeds one existing repair cycle and preserves all missions', async () => {
  const db = sqliteD1();
  try {
    const repository = new D1DevJobRepository(db);
    await publishedJob(repository);
    const other = await repository.create({ id: 'queued-other', requested_by: 'mel-autonomy', goal: 'Independent objective' });
    const result = await reconcileFailedCandidateRuns({ repository, env, fetchImpl: ciFetch() });
    assert.equal(result.repaired.length, 1);
    const stored = await repository.get('published');
    assert.equal(stored.status, 'REPAIR_REQUIRED');
    assert.equal(stored.result_json.dev_bridge.needs_repair, true);
    assert.equal(stored.result_json.candidate_ci_failure.base_sha, BASE);
    assert.equal(stored.result_json.concurrentEvidence, 'must survive');
    assert.equal((await repository.get(other.id)).status, 'QUEUED');
    assert.equal(stored.result_json.autonomy_completion, undefined);
    assert.equal((await reconcileFailedCandidateRuns({ repository, env, fetchImpl: ciFetch() })).repaired.length, 0);
  } finally { db.close(); }
});

for (const options of [{ conclusion: 'success' }, { conclusion: 'cancelled' }, { status: 'in_progress', conclusion: null }, { runSha: BASE }, { branch: 'main' }, { head: BASE }, { http: 403 }]) {
  test(`CI does not reopen an unproved or superseded failure: ${JSON.stringify(options)}`, async () => {
    const repository = new D1DevJobRepository(null);
    await publishedJob(repository);
    const result = await reconcileFailedCandidateRuns({ repository, env, fetchImpl: ciFetch(options) });
    assert.equal(result.repaired.length, 0);
    assert.equal((await repository.get('published')).status, 'READY_FOR_REVIEW');
  });
}

test('concurrent job update is retained and reported, never blindly retried', async () => {
  const repository = new D1DevJobRepository(null);
  await publishedJob(repository);
  let once = false;
  const result = await reconcileFailedCandidateRuns({ repository, env, fetchImpl: ciFetch({ beforeReply: async () => {
    if (once) return; once = true;
    const latest = await repository.get('published');
    await repository.update(latest.id, { result_json: { ...latest.result_json, newReceipt: 'concurrent' } }, { expected: latest });
  } }) });
  assert.equal(result.repaired.length, 0);
  assert.equal(result.deferred[0].code, 'JOB_UPDATE_CONFLICT');
  assert.equal((await repository.get('published')).result_json.newReceipt, 'concurrent');
  assert.equal((await repository.get('published')).status, 'READY_FOR_REVIEW');
});

test('two reconciliation calls cannot produce two repairs for the same published job', async () => {
  const repository = new D1DevJobRepository(null);
  await publishedJob(repository);
  const results = await Promise.all([1, 2].map(() => reconcileFailedCandidateRuns({ repository, env, fetchImpl: ciFetch() })));
  assert.equal(results.reduce((sum, row) => sum + row.repaired.length, 0), 1);
  assert.equal((await repository.get('published')).result_json.dev_bridge_history.length, 1);
});

test('known sanitizer literal is retained while invented omitted-code markers remain refused', async () => {
  const source = "export function clean() { return '[TRUNCATED]'; }\nexport const flag=false;\n";
  const result = await engineFor({ edits: [{ path, find: 'flag=false', replace: 'flag=true' }] })
    .propose({ env: {}, goal: 'Preserve existing sanitizer', inspectedFiles: [{ path, content: source }] });
  assert.match(result.proposal.changes[0].content, /\[TRUNCATED\]/);
  await assert.rejects(engineFor({ edits: [{ path, find: 'flag=false', replace: "flag='[contenu omis]'" }] })
    .propose({ env: {}, goal: 'Reject omission', inspectedFiles: [{ path, content: source }] }),
  error => error.failures.every(row => row.error === 'MENTOR_INVALID_CHANGE'));
});

for (const changed of ['src/unrelated.js', 'src/work/work-dag.js']) {
  test(`advanced candidate preserves concurrent work and requires proof of unchanged repair scope: ${changed}`, async () => {
    const repository = new D1DevJobRepository(null);
    const job = await publishedJob(repository);
    await repository.update(job.id, { result_json: { ...job.result_json, bridge_preparation: { ...job.result_json.bridge_preparation, files: [path] } } });
    const read = ciFetch({ head: BASE });
    const result = await reconcileFailedCandidateRuns({ repository, env, fetchImpl: async url => String(url).includes('/compare/')
      ? Response.json({ status: 'ahead', merge_base_commit: { sha: SHA }, files: [{ filename: changed }] }) : read(url) });
    assert.equal(result.repaired.length, changed === path ? 0 : 1);
    const stored = await repository.get(job.id);
    if (changed !== path) {
      assert.equal(stored.result_json.candidate_ci_failure.candidate_sha, BASE);
      assert.equal(stored.result_json.candidate_ci_failure.failed_candidate_sha, SHA);
      assert.equal(stored.result_json.teacher_bridge.request.request_id, job.id, 'old review is preserved for subsequent exact-SHA reconciliation');
    }
  });
}

test('a find in the complete file but outside the actual prompt excerpt is refused', async () => {
  const source = 'export const visible = 1;\n' + '// kept padding\n'.repeat(400) + 'export const hidden = false;\n';
  await assert.rejects(engineFor({ edits: [{ path, find: 'hidden = false', replace: 'hidden = true' }] })
    .propose({ env: {}, goal: 'Edit only what this provider saw', inspectedFiles: [{ path, content: source }] }),
  error => error.failures.every(row => row.error === 'MENTOR_UNINSPECTED_EDIT'));
});

test('the seventh inspected file is not writable when the prompt exposed only six files', async () => {
  const files = Array.from({ length: 7 }, (_, index) => ({ path: `src/visible-${index}.js`, content: 'export const value = false;\n' }));
  await assert.rejects(engineFor({ edits: [{ path: files[6].path, find: 'value = false', replace: 'value = true' }] })
    .propose({ env: {}, goal: 'Match validation to provider inspection', inspectedFiles: files }),
  error => error.failures.every(row => row.error === 'MENTOR_UNINSPECTED_EDIT'));
});

test('the subsequent four-line runtime stub cannot replace the inspected autonomy engine', async () => {
  const runtimePath = 'src/evolution/autonomy-runtime.js';
  const source = await readFile(new URL('../src/evolution/autonomy-runtime.js', import.meta.url), 'utf8');
  const stub = 'export async function getTeacherResponses() {\n  // Implémentation de la fonction pour récupérer les réponses Teacher\n  // ...\n}';
  assert.throws(() => assertMentorCodeContract(runtimePath, source, stub), /MENTOR_EXPORT_CONTRACT_REMOVED/);
  await assert.rejects(engineFor({ changes: [{ path: runtimePath, content: stub, reason: 'Modification appliquée sur le fichier inspecté' }] })
    .propose({ env: {}, goal: 'Preserve existing autonomy controls', inspectedFiles: [{ path: runtimePath, content: source }] }),
  error => error.failures.every(row => row.error === 'MENTOR_LONG_FILE_REQUIRES_EDIT'));
});
