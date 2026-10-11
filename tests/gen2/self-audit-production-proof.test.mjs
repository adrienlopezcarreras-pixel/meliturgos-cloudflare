import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/mel-self-audit-production-proof.yml','utf8');
const router = fs.readFileSync('src/router.js','utf8');
const capability = fs.readFileSync('src/capabilities/self-audit-capability.js','utf8');
const security = fs.readFileSync('src/core/security.js','utf8');
const downstream = fs.readFileSync('.github/workflows/release-downstream-proof-decoupled.yml','utf8');
const deploy = fs.readFileSync('.github/workflows/deploy-cloudflare-release.yml','utf8');

test('self-audit production proof runs only after a successful production release', () => {
  assert.match(workflow, /workflows:\s*\["deploy-cloudflare-release"\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /deployed_sha/);
});

test('self-audit proof can be rerun for one exact deployed SHA and retries bootstrap propagation', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /Self-audit run propagation attempt/);
  assert.match(workflow, /Self-audit status propagation attempt/);
  assert.match(workflow, /RUN_READY/);
  assert.match(workflow, /STATUS_READY/);
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

test('self-audit uses existing exact-SHA parallel proof, never puts or deletes production secrets', () => {
  assert.match(workflow, /PROOF_KEY_B64: \${{ secrets\\.MEL_BACKUP_ENCRYPTION_KEY_B64 }}/);
  assert.match(workflow, /SELF_AUDIT_PARALLEL_PROOF_SOURCE_INVALID/);
  assert.match(workflow, /x-mel-parallel-proof: \${TOKEN}/);
  assert.match(workflow, /MEL_PARALLEL_PROOF_V1:/);
  assert.match(workflow, /meliturgos-parallel-proof-salt-v1/);
  assert.match(downstream, /MEL_PARALLEL_PROOF_V1:/);
  assert.match(deploy, /MEL_PARALLEL_PROOF_TOKEN:/);
  assert.doesNotMatch(workflow, /wrangler secret (?:put|delete)/);
  assert.doesNotMatch(workflow, /MEL_LAUNCH_BOOTSTRAP_TOKEN --env=/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN:/);
  assert.match(workflow, /group: mel-self-audit-production-proof/);
  assert.doesNotMatch(workflow, /group: mel-launch-bootstrap-token/);
});

test('release smoke capability and parallel proof remain constrained to safe exact-SHA routes', () => {
  assert.match(security, /PARALLEL_PROOF_ALLOWLIST/);
  assert.match(security, /'\\/api\\/gen2\\/capabilities\\/execute'/);
  assert.match(security, /'\\/api\\/gen2\\/code\\/self-check'/);
  assert.match(security, /parallelAuthorized/);
  assert.match(workflow, /"level":"HEARTBEAT"/);
  assert.match(capability, /repairEnabled:\\s*context\\?\\.releaseSmoke !== true/);
});

test('parallel proof heredoc is closed at Bash root after YAML indentation stripping', () => {
  const block=workflow.slice(workflow.indexOf('      - name: Prove exact-SHA persistent self-audit heartbeat'),workflow.indexOf('      - name: Upload sanitized self-audit proof'));
  const openings=(block.match(/<<'NODE'/g)||[]).length;
  const terminators=(block.match(/^ {10}NODE$/gm)||[]).length;
  assert.equal(openings,terminators,'every heredoc terminator must align to Bash column 0');
  assert.ok(openings>=2);
});
