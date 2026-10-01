import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/mel-self-audit-production-proof.yml','utf8');
const router = fs.readFileSync('src/router.js','utf8');
const capability = fs.readFileSync('src/capabilities/self-audit-capability.js','utf8');

test('self-audit production proof runs only after a successful production release', () => {
  assert.match(workflow, /workflows:\s*\["deploy-cloudflare-release"\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /deployed_sha/);
});

test('release smoke exposes self-audit proof surface but caps it to HEARTBEAT', () => {
  assert.match(router, /"self\.audit\.status"/);
  assert.match(router, /"self\.audit\.run"/);
  assert.match(capability, /SELF_AUDIT_RELEASE_SMOKE_HEARTBEAT_ONLY/);
  assert.match(capability, /repairEnabled:\s*context\?\.releaseSmoke !== true/);
  assert.match(workflow, /"level":"HEARTBEAT"/);
  assert.match(workflow, /SELF_AUDIT_RELEASE_PROOF_MUTATION_NOT_DISABLED/);
});

test('production proof requires durable D1 state and capability health ledger', () => {
  assert.match(workflow, /SELF_AUDIT_HEARTBEAT_NOT_PERSISTED/);
  assert.match(workflow, /SELF_AUDIT_REPORT_NOT_PERSISTED/);
  assert.match(workflow, /SELF_AUDIT_LEDGER_NOT_PERSISTED/);
  assert.match(workflow, /capability_ledger_count/);
  assert.match(workflow, /secret_values_exposed:false/);
});
