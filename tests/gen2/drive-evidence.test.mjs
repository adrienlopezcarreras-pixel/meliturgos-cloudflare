import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDriveEvidence,
  evidenceFileName,
  uploadDriveEvidence,
} from '../../src/evidence/drive-evidence.js';

const SHA = 'a'.repeat(40);

test('Drive evidence binds checkpoint, commit, CI, learning and tests', () => {
  const evidence = buildDriveEvidence({
    run_id: 'GEN2-17-run-1',
    checkpoint: { job_id: 'GEN2-17', stage: 'TEST', integrity_sha256: 'proof' },
    branch: 'candidate/mel-clean-autonomy',
    commit_sha: SHA,
    ci: { status: 'PENDING' },
    learning: { status: 'TRAINED_UNBENCHMARKED' },
    tests: [{ name: 'npm test', passed: true }],
    status: 'PENDING_CI',
    created_at: '2026-09-15T08:00:00.000Z',
  });
  assert.equal(evidence.commit_sha, SHA);
  assert.equal(evidence.checkpoint.job_id, 'GEN2-17');
  assert.equal(evidence.tests[0].passed, true);
  assert.match(evidenceFileName(evidence), /MEL-EVIDENCE-20260915-aaaaaaaaaaaa-GEN2-17-run-1\.json/);
});

test('Drive evidence rejects malformed SHA and non-candidate branches', () => {
  assert.throws(() => buildDriveEvidence({ branch: 'candidate/mel-clean-autonomy', commit_sha: 'abc' }), /DRIVE_EVIDENCE_COMMIT_SHA_REQUIRED/);
  assert.throws(() => buildDriveEvidence({ branch: 'main', commit_sha: SHA }), /DRIVE_EVIDENCE_CANDIDATE_BRANCH_REQUIRED/);
});

test('Drive upload fails closed without a write token', async () => {
  const evidence = buildDriveEvidence({ branch: 'candidate/mel-clean-autonomy', commit_sha: SHA });
  await assert.rejects(() => uploadDriveEvidence({}, evidence, { fetchFn: async () => { throw new Error('should not run'); } }), /DRIVE_EVIDENCE_TOKEN_REQUIRED/);
});

test('Drive upload creates a unique JSON proof with mocked provider response', async () => {
  const evidence = buildDriveEvidence({
    run_id: 'run-42',
    branch: 'candidate/mel-clean-autonomy',
    commit_sha: SHA,
  });
  let request = null;
  const result = await uploadDriveEvidence(
    { GOOGLE_DRIVE_ACCESS_TOKEN: 'unit-test-token', GOOGLE_DRIVE_EVIDENCE_FOLDER_ID: 'folder-1' },
    evidence,
    {
      fetchFn: async (url, init) => {
        request = { url, init };
        return new Response(JSON.stringify({
          id: 'drive-file-1',
          name: evidenceFileName(evidence),
          webViewLink: 'https://drive.google.com/file/d/drive-file-1/view',
          createdTime: '2026-09-15T08:00:00.000Z',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.equal(result.status, 'SYNCED');
  assert.equal(result.drive_file_id, 'drive-file-1');
  assert.match(request.url, /uploadType=multipart/);
  assert.match(request.init.headers.authorization, /^Bearer /);
  assert.match(String(request.init.body), /folder-1/);
  assert.doesNotMatch(JSON.stringify(result), /unit-test-token/);
});
