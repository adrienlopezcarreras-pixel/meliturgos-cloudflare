import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release smoke can read only the sanitized sovereignty status route', async () => {
  const security=await readFile(new URL('../../src/core/security.js',import.meta.url),'utf8');
  const getBlock=security.split("['GET', new Set([")[1]?.split("])],")[0]||'';
  const postBlock=security.split("['POST', new Set([")[1]?.split("])],")[0]||'';
  assert.match(getBlock,/\/api\/gen2\/autonomy\/sovereignty/);
  assert.doesNotMatch(postBlock,/\/api\/gen2\/autonomy\/sovereignty/);
});

test('release captures sanitized exact-SHA sovereignty evidence without requiring false maturity', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/Capture sanitized production sovereignty status/);
  assert.match(workflow,/\/api\/gen2\/autonomy\/sovereignty/);
  assert.match(workflow,/mel\.sovereignty-production-status\/v1/);
  assert.match(workflow,/source_sha:process\.env\.EXPECTED_SHA/);
  assert.match(workflow,/secret_values_exposed:false/);
  assert.match(workflow,/covered_layers:/);
  assert.match(workflow,/uncovered_layers:/);
  assert.match(workflow,/blocked_layers:blocked/);
  assert.match(workflow,/next_action:gap\?\.next_action/);
  assert.match(workflow,/rm -f production-sovereignty-status\.json/);
  assert.match(workflow,/Upload sanitized production sovereignty proof/);
  assert.match(workflow,/path: production-sovereignty-proof\.json/);
  assert.doesNotMatch(workflow,/if\s*\(d\?\.fully_sovereign!==true\)/);
});


test('MEL-SOV-01 live proof splits heavy refreshes and uses immutable exact-SHA auth', async () => {
  const workflow=await readFile(new URL('../../.github/workflows/mel-sov-01-live-proof.yml',import.meta.url),'utf8');
  assert.match(workflow,/MEL_BACKUP_ENCRYPTION_KEY_B64/);
  assert.match(workflow,/MEL_PARALLEL_PROOF_V1:/);
  assert.match(workflow,/x-mel-parallel-proof/);
  assert.match(workflow,/for TARGET in ai ai_local source_control infrastructure/);
  assert.match(workflow,/for STEP in prepare readback rollback finalize/);
  assert.match(workflow,/refresh=\\$\\{TARGET\\}/);
  assert.match(workflow,/step=\\$\\{STEP\\}/);
  assert.match(workflow,/release-launch-bootstrap\?refresh=\$\{TARGET\}/);
  assert.match(workflow,/MEL_SOV_01_REFRESH_STEP_VERIFIED/);
  assert.match(workflow,/--max-time 75/);
  assert.match(workflow,/--max-time 60/);
  assert.match(workflow,/for ATTEMPT in \$\(seq 1 6\)/);
  assert.match(workflow,/409\|429\|500\|502\|503\|504/);
  assert.match(workflow,/MEL_SOV_01_REFRESH_FAILED/);
  assert.match(workflow,/refresh_error:/);
  assert.doesNotMatch(workflow,/wrangler secret put/);
  assert.doesNotMatch(workflow,/wrangler secret delete/);
  assert.doesNotMatch(workflow,/MEL_LAUNCH_BOOTSTRAP_TOKEN/);
});
