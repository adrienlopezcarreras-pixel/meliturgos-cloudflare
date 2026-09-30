import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release smoke can read only the sanitized sovereignty status route', async () => {
  const security=await readFile(new URL('../../src/core/security.js',import.meta.url),'utf8');
  assert.match(security,/\['GET', new Set\(\[[\s\S]*'\/api\/gen2\/autonomy\/sovereignty'/);
  assert.doesNotMatch(security,/\['POST', new Set\(\[[\s\S]*'\/api\/gen2\/autonomy\/sovereignty'/);
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
