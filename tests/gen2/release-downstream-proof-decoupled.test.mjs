import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('decoupled downstream proof never deploys, rolls back, toggles MAX, or mutates launch secrets', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/expected_sha:/);
  assert.match(workflow,/x-mel-parallel-proof/);
  assert.match(workflow,/MEL_PARALLEL_PROOF_V1:/);
  assert.match(workflow,/api\/gen2\/code\/self-check/);
  assert.match(workflow,/browser\.execute/);
  assert.match(workflow,/mel-file-browser-production-proof/);
  assert.match(workflow,/sovereignty-proof/);
  assert.match(workflow,/MEL_SOV_01_DONE_VERIFIED_ELIGIBLE/);
  assert.doesNotMatch(workflow,/wrangler\s+(?:deploy|secret|versions)/);
  assert.doesNotMatch(workflow,/MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(workflow,/rollback/i);
  assert.doesNotMatch(workflow,/max[_ -]?autonomy|MAX 100/i);
});

test('decoupled MEL-FILE proof serializes browser pressure and retries only transient statuses', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/file:\n\s+needs: browser/);
  assert.match(workflow,/for ATTEMPT in \$\(seq 1 8\)/);
  assert.match(workflow,/409\|429\|500\|502\|503\|504/);
  assert.match(workflow,/Non-retryable MEL-FILE browser proof status/);
});

test('decoupled browser proof retries bounded transient failures before gating MEL-FILE', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/BROWSER_READY=0/);
  assert.match(workflow,/for ATTEMPT in \$\(seq 1 6\)/);
  assert.match(workflow,/Transient browser\.execute proof status/);
  assert.match(workflow,/Non-retryable browser\.execute proof status/);
});

test('sovereignty proof binds exact SHA through code self-check instead of requiring duplicate SHA metadata', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/sovereignty-sha-status\.json/);
  assert.match(workflow,/api\/gen2\/code\/self-check/);
  const statusBlock=workflow.split("output sovereignty.json")[1]?.split("SOV_CODE=")[0]||'';
  assert.doesNotMatch(statusBlock,/d\?\.deployed_sha/);
  assert.match(statusBlock,/TECHNICAL_SOVEREIGNTY_STATUS/);
});

test('decoupled sovereignty proof refreshes every bounded prevalidation domain before final status', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/for TARGET in ai ai_local source_control infrastructure backup_restore/);
  assert.match(workflow,/release-launch-bootstrap\?refresh=\$\{TARGET\}/);
  assert.match(workflow,/MEL_SOV_01_REFRESH_STEP_VERIFIED/);
  assert.match(workflow,/MEL_SOV_01_REFRESH_SAFETY_FAILED/);
  const refresh=workflow.indexOf('for TARGET in ai ai_local source_control infrastructure backup_restore');
  const status=workflow.indexOf('output sovereignty.json');
  const finalProof=workflow.indexOf('output mel-sov-01.json');
  assert.ok(refresh>0&&status>refresh&&finalProof>status,'sovereignty refreshes must run before status and final proof');
});

test('decoupled sovereignty refreshes retry only bounded transient pressure and preserve a sanitized failure artifact', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/release-downstream-proof-decoupled.yml',import.meta.url),'utf8');
  assert.match(workflow,/REFRESH_READY=0/);
  assert.match(workflow,/for ATTEMPT in \$\(seq 1 6\)/);
  assert.match(workflow,/409\|429\|500\|502\|503\|504/);
  assert.match(workflow,/Transient decoupled SOV refresh/);
  assert.match(workflow,/Non-retryable decoupled SOV refresh/);
  assert.match(workflow,/status:'MEL_SOV_01_REFRESH_FAILED'/);
  assert.match(workflow,/secret_values_exposed:false/);
});

test('release installs exact-SHA immutable proof token and dispatches downstream proof before ShardVault launch evidence', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/MEL_PARALLEL_PROOF_TOKEN:parallelProofToken/);
  assert.match(workflow,/meliturgos-parallel-proof-salt-v1/);
  assert.match(workflow,/MEL_PARALLEL_PROOF_V1:/);
  assert.match(workflow,/Dispatch decoupled downstream production proofs/);
  assert.match(workflow,/release-downstream-proof-decoupled\.yml\/dispatches/);
  assert.match(workflow,/inputs:\{expected_sha:process\.env\.EXPECTED_SHA\}/);
  const dispatch=workflow.indexOf('Dispatch decoupled downstream production proofs');
  const shardvault=workflow.indexOf('Prepare and prove production autonomy launch evidence');
  assert.ok(dispatch>0&&shardvault>dispatch,'parallel proof must be launched before blocking ShardVault evidence');
});

test('parallel proof auth is narrower than the normal release-smoke token', async () => {
  const security=await readFile(new URL('../../src/core/security.js',import.meta.url),'utf8');
  assert.match(security,/PARALLEL_PROOF_ALLOWLIST/);
  assert.match(security,/MEL_PARALLEL_PROOF_TOKEN/);
  assert.match(security,/x-mel-parallel-proof/);
  const block=security.split('const PARALLEL_PROOF_ALLOWLIST')[1]?.split('export function isReleaseSmokeRequest')[0]||'';
  assert.match(block,/api\/gen2\/capabilities\/execute/);
  assert.match(block,/api\/gen2\/code\/self-check/);
  assert.match(block,/api\/gen2\/autonomy\/sovereignty/);
  assert.doesNotMatch(block,/api\/chat/);
  assert.doesNotMatch(block,/api\/files\/upload/);
});
