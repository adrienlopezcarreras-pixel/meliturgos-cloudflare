import test from 'node:test';
import assert from 'node:assert/strict';
import { collectRoadmapTestEvidence, validateObjectiveTestEvidence } from '../src/evolution/roadmap-test-evidence.js';
import { objectiveVerificationProfile } from '../src/evolution/objective-verification-profiles.js';
import { roadmapContractRevision } from '../src/roadmap/roadmap-code-contracts.js';
const sha = 'a'.repeat(40), id = 'MEL-MANIFEST-01';
const job = { goal: '[' + id + '] Rapport', optional_context: { roadmap_id: id, roadmap_contract_revision: roadmapContractRevision(id) } };
const requirements = objectiveVerificationProfile(job.goal).required_tests;
const log = Object.entries(requirements).map(([path, names]) => names.map((name, i) => 'ok ' + (i + 1) + ' - ' + name).join('\n') + '\n✓ ' + path).join('\n') + '\n1073 passed, 0 failed\nexit_code=0\n';
const collect = text => collectRoadmapTestEvidence(text, { candidateSha: sha, runId: 123, attempt: 1, exitCode: 0 });
const proof = text => ({ ok: true, mandatory_tests_verified: true, candidate_sha: sha, run_id: 123, digest: 'b'.repeat(64), roadmap_test_evidence: collect(text) });

test('objective tests are taken from actual full-runner file blocks and exact contract revision', () => {
  assert.equal(validateObjectiveTestEvidence(proof(log), job, sha, 123), true);
  assert.equal(validateObjectiveTestEvidence(proof(log), job, 'c'.repeat(40), 123), false);
  assert.equal(validateObjectiveTestEvidence(proof(log), { ...job, optional_context: { ...job.optional_context, roadmap_contract_revision: 'old' } }, sha, 123), false);
});

test('model test paths, cases in another file and failed cases cannot become objective evidence', () => {
  const path = Object.keys(requirements)[0], name = requirements[path][0];
  for (const bad of [
    log.replace('✓ ' + path, '✓ test/autonomy-readiness.test.mjs'),
    log.replace('ok 1 - ' + name, 'ok 1 - ' + name + '\n✓ tests/unrelated.test.mjs'),
    log.replace('ok 1 - ' + name, 'not ok 1 - ' + name),
    log.replace('1073 passed, 0 failed', '1072 passed, 1 failed'),
  ]) assert.equal(validateObjectiveTestEvidence(proof(bad), job, sha, 123), false);
});

test('legacy receipts without objective cases stay unproven rather than inheriting unrelated Founder tests', () => {
  assert.equal(validateObjectiveTestEvidence({ ok: true, mandatory_tests_verified: true, candidate_sha: sha, run_id: 123, digest: 'b'.repeat(64), tests: [{ passed: true }] }, job, sha, 123), false);
});
