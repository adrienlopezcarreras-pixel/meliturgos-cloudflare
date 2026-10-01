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

test('canonical post-release suite runs the reusable live connection proof after deploy', async () => {
  const parent=await readFile(new URL('../../.github/workflows/post-release-proof-suite.yml',import.meta.url),'utf8');
  assert.match(parent,/workflow_run:/);
  assert.match(parent,/workflows:\s*\["deploy-cloudflare-release"\]/);
  assert.match(parent,/connections:\n[\s\S]*uses: \.\/\.github\/workflows\/live-connections-production-proof\.yml/);
  assert.match(parent,/expected_sha:\s*\$\{\{\s*needs\.resolve\.outputs\.expected_sha\s*\}\}/);
});
