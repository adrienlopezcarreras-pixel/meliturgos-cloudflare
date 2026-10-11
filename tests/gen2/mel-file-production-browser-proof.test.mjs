import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release workflow proves Normal and Full MEL file staging in a real browser', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/Prove MEL-FILE-01 in real production browser/);
  assert.match(workflow,/action:'browser\.set-headers'/);
  assert.match(workflow,/action:'browser\.upload-file',selector:'#fileInput'/);
  assert.match(workflow,/action:'browser\.wait-text',selector:'#attachments'/);
  assert.match(workflow,/action:'browser\.navigate',url:origin\+'\/professor'/);
  assert.match(workflow,/action:'browser\.upload-file',selector:'#chatFileInput'/);
  assert.match(workflow,/action:'browser\.wait-text',selector:'#chatAttachments'/);
  assert.match(workflow,/mel\.file-browser-production-proof\/v1/);
  assert.match(workflow,/source_sha:process\.env\.EXPECTED_SHA/);
  assert.match(workflow,/secret_values_exposed:false/);
  assert.match(workflow,/Upload MEL-FILE-01 production proof/);
});

test('canonical release directly gates success on the reusable live connection proof suite', async () => {
  const [deploy,parent]=await Promise.all([
    readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8'),
    readFile(new URL('../../.github/workflows/post-release-proof-suite.yml',import.meta.url),'utf8'),
  ]);
  assert.match(parent,/workflow_call:/);
  assert.doesNotMatch(parent,/workflow_run:/);
  assert.match(deploy,/post-release-health:\n[\s\S]*needs:\s*deploy[\s\S]*uses:\s*\.\/\.github\/workflows\/post-release-proof-suite\.yml/);
  assert.match(parent,/connections:\n[\s\S]*uses: \.\/\.github\/workflows\/live-connections-production-proof\.yml/);
  assert.match(parent,/expected_sha:\s*\$\{\{\s*needs\.resolve\.outputs\.expected_sha\s*\}\}/);
});


test('parallel proof can stage only an exact-SHA bounded MEL-FILE upload', async () => {
  const security=await readFile(new URL('../../src/core/security.js',import.meta.url),'utf8');
  const upload=await readFile(new URL('../../src/api/file-upload.js',import.meta.url),'utf8');
  const parallel=security.split('const PARALLEL_PROOF_ALLOWLIST')[1]?.split('export function isReleaseSmokeRequest')[0]||'';
  assert.match(parallel,/\/api\/files\/upload/);
  assert.match(upload,/parallelProofUpload/);
  assert.match(upload,/mel-file-\(normal\|full\)-proof\\\.txt/);
  assert.match(upload,/bytes\.byteLength > 16_384/);
  assert.match(upload,/MEL_FILE_\(NORMAL\|FULL\)_PROOF_/);
  assert.match(upload,/proofMatch\[2\]\.toLowerCase\(\) !== deployedSha/);
  assert.match(upload,/parallelProofUpload \? 300 : mediaTtlSeconds\(env\)/);
  assert.match(upload,/MEL_FILE_PROOF_UPLOAD_REJECTED/);
  assert.match(upload,/MEL_FILE_PROOF_PAYLOAD_INVALID/);
});
