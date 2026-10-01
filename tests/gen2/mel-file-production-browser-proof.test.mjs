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

test('live connection proof follows a successful exact release automatically', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/live-connections-production-proof.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/workflows: \["deploy-cloudflare-release"\]/);
  assert.match(workflow,/github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow,/github\.event\.workflow_run\.head_branch == 'release\/mel-hardware-v0\.1\.0'/);
  assert.match(workflow,/LIVE_PROOF_SHA:/);
  assert.match(workflow,/github\.event\.workflow_run\.head_sha/);
});
