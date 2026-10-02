import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/council-rich-ui-production-proof.yml','utf8');

test('production proof is reusable and tied to an explicit exact SHA', () => {
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /INPUT_SHA:\s*\$\{\{ inputs\.expected_sha \}\}/);
  assert.match(workflow, /ref:\s*\$\{\{ needs\.resolve\.outputs\.expected_sha \}\}/);
  assert.match(workflow, /EXACT_SHA_SELF_CHECK_MISMATCH/);
  assert.match(workflow, /d\?\.deployed_sha/);
  assert.match(workflow, /tests\/native-chat-negative-feedback-council\.test\.mjs/);
});

test('production proof exercises live Model Council with negative-feedback recovery context', () => {
  assert.match(workflow, /"id":"model\.council"/);
  assert.match(workflow, /OWNER_NEGATIVE_FEEDBACK_RECOVERY/);
  assert.match(workflow, /independent_response_count/);
  assert.match(workflow, /synthesis_status/);
});

test('production Council proof uses all four authorized zero-cost models with a bounded latency budget', () => {
  assert.match(workflow, /"maxCandidates":4,"timeoutMs":12000/);
  assert.match(workflow, /COUNCIL_MAX_ATTEMPTS=2/);
  assert.match(workflow, /--max-time 90/);
  assert.match(workflow, /independent_response_count\|\|0\)>=2/);
});

test('production proof verifies rich renderer in Normal and Full browser surfaces', () => {
  assert.match(workflow, /#promptInput/);
  assert.match(workflow, /#messages \.msg\.mel > div\[data-rich-rendered="true"\]/);
  assert.match(workflow, /\.nav button\[data-view="chat"\]/);
  assert.match(workflow, /#chatInput/);
  assert.match(workflow, /#chatlog \.msg\.mel\[data-rich-rendered="true"\]:last-child/);
  assert.match(workflow, /RELEASE_CODE_SMOKE_OK/);
});

test('production proof uses immutable exact-SHA proof auth and never mutates Worker secrets', () => {
  assert.match(workflow, /MEL_BACKUP_ENCRYPTION_KEY_B64/);
  assert.match(workflow, /MEL_PARALLEL_PROOF_V1:/);
  assert.match(workflow, /x-mel-parallel-proof/);
  assert.doesNotMatch(workflow, /wrangler secret put/);
  assert.doesNotMatch(workflow, /wrangler secret delete/);
  assert.doesNotMatch(workflow, /MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.match(workflow, /secret_values_exposed:false/);
});


test('production proof tolerates only bounded transient proof-auth propagation', () => {
  assert.match(workflow, /for ATTEMPT in \$\(seq 1 12\)/);
  assert.match(workflow, /COUNCIL_ERROR_CODE/);
  assert.match(workflow, /BROWSER_ERROR_CODE/);
  assert.match(workflow, /AUTH_REQUIRED/);
  assert.match(workflow, /sleep 2/);
});

test('rich UI browser proof retries bounded transient runtime pressure instead of failing one-shot', () => {
  assert.match(workflow, /409\|429\|500\|502\|503\|504/);
  assert.match(workflow, /Transient rich UI browser proof status/);
  assert.match(workflow, /Non-retryable rich UI browser proof status/);
  assert.match(workflow, /ATTEMPT < 8 \? ATTEMPT \* 2 : 15/);
});
