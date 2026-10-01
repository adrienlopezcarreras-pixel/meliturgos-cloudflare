import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/council-rich-ui-production-proof.yml','utf8');

test('production proof is tied to successful deploy workflow and exact SHA', () => {
  assert.match(workflow, /workflows:\s*\["deploy-cloudflare-release"\]/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /EXACT_SHA_SELF_CHECK_MISMATCH/);
  assert.match(workflow, /tests\/native-chat-negative-feedback-council\.test\.mjs/);
});

test('production proof exercises live Model Council with negative-feedback recovery context', () => {
  assert.match(workflow, /"id":"model\.council"/);
  assert.match(workflow, /OWNER_NEGATIVE_FEEDBACK_RECOVERY/);
  assert.match(workflow, /COUNCIL_LIVE_INDEPENDENCE_MISSING/);
  assert.match(workflow, /synthesis_status/);
});

test('production proof verifies rich renderer in Normal and Full browser surfaces', () => {
  assert.match(workflow, /#promptInput/);
  assert.match(workflow, /#messages \.msg\.mel > div\[data-rich-rendered="true"\]/);
  assert.match(workflow, /\.nav button\[data-view="chat"\]/);
  assert.match(workflow, /#chatInput/);
  assert.match(workflow, /#chatlog \.msg\.mel\[data-rich-rendered="true"\]:last-child/);
  assert.match(workflow, /RELEASE_CODE_SMOKE_OK/);
});

test('temporary production bootstrap secret is always cleaned up', () => {
  assert.match(workflow, /trap cleanup EXIT/);
  assert.match(workflow, /wrangler secret delete MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.match(workflow, /secret_values_exposed:false/);
});
