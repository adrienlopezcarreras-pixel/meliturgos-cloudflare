import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/activate-platform-capabilities.yml',import.meta.url),'utf8');

test('pull request runs diagnostics contract without production mutation', () => {
  assert.match(workflow,/auth-diagnostics-contract:\n\s+if: github\.event_name == 'pull_request'/);
  assert.match(workflow,/node --test tests\/platform-auth-diagnostics-contract\.test\.mjs/);
  assert.match(workflow,/activate-and-prove:\n\s+if: github\.event_name != 'pull_request'/);
  assert.match(workflow,/platform-auth-contract-\{0\}/);
  assert.match(workflow,/\|\| 'mel-launch-bootstrap-token'/);
});

test('production proof uses immutable per-deployment authorization and verifies exact SHA', () => {
  assert.match(workflow,/PROOF_KEY_B64: \$\{\{ secrets\.MEL_BACKUP_ENCRYPTION_KEY_B64 \}\}/);
  assert.match(workflow,/meliturgos-parallel-proof-salt-v1/);
  assert.match(workflow,/MEL_PARALLEL_PROOF_V1:/);
  assert.match(workflow,/x-mel-parallel-proof: \$\{TOKEN\}/);
  assert.match(workflow,/api\/internal\/release-launch-bootstrap/);
  assert.match(workflow,/RELEASE_IDENTITY_VERIFIED/);
  assert.match(workflow,/PLATFORM_EXACT_SHA_IDENTITY_MISMATCH/);
  assert.ok(workflow.indexOf('PLATFORM_EXACT_SHA_IDENTITY_MISMATCH') < workflow.indexOf('capability cloudflare.workers.read'));
  assert.doesNotMatch(workflow,/wrangler secret (?:put|delete) MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(workflow,/x-mel-launch-bootstrap: \$\{TOKEN\}/);
});

test('401 refusal remains sanitized and fails closed without propagation retry', () => {
  assert.match(workflow,/REDACTED_AUTH_ERROR/);
  assert.match(workflow,/Parallel proof authorization rejected; refusing further retries/);
  assert.doesNotMatch(workflow,/cat\s+"?\$\{out\}"?/);
  assert.doesNotMatch(workflow,/openssl rand -hex 32/);
});

test('post-release capability checks read existing bindings and never rotate Worker secrets', () => {
  assert.match(workflow,/Verify existing runtime bindings without mutating production/);
  assert.match(workflow,/wrangler secret list --name meliturgos --format json/);
  assert.match(workflow,/PLATFORM_RUNTIME_BINDINGS_MISSING/);
  assert.match(workflow,/GITHUB_RUNTIME_CREDENTIAL=/);
  assert.match(workflow,/proof_mutated_production_secrets:false/);
  assert.doesNotMatch(workflow,/wrangler\\s+secret\\s+(?:put|delete)/);
  assert.doesNotMatch(workflow,/MEL_GITHUB_TOKEN: \\$\\{\\{ secrets/);
  assert.ok(workflow.indexOf('PLATFORM_RUNTIME_BINDINGS_MISSING') < workflow.indexOf('PLATFORM_EXACT_SHA_IDENTITY_MISMATCH'));
});
