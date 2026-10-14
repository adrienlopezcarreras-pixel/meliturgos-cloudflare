import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('.github/workflows/persistent-capability-stress-live-proof.yml','utf8');
const runner=readFileSync('scripts/persistent-capability-stress-live-proof.mjs','utf8');

test('production stress never mutates Cloudflare secrets or deploys',()=>{
  assert.doesNotMatch(source,/wrangler\s+(?:secret|deploy|versions)/);
  assert.doesNotMatch(source,/MEL_LAUNCH_BOOTSTRAP_TOKEN|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(source,/openssl\s+rand|printf 'y\\n'|npx\s+wrangler/);
});

test('exact SHA is authenticated before starting the persistent 165-capability audit',()=>{
  const prod=source.slice(source.indexOf('  production-proof:\n'));
  assert.match(prod,/if: github\.event_name != 'pull_request'/);
  assert.match(prod,/MEL_BACKUP_ENCRYPTION_KEY_B64/);
  assert.match(prod,/meliturgos-parallel-proof-salt-v1/);
  assert.match(prod,/MEL_PARALLEL_PROOF_V1:/);
  assert.match(prod,/x-mel-parallel-proof/);
  assert.match(prod,/api\/internal\/release-launch-bootstrap/);
  assert.match(prod,/RELEASE_IDENTITY_VERIFIED/);
  assert.match(prod,/STRESS_DEPLOYED_SHA_UNVERIFIED/);
  assert.ok(prod.indexOf('STRESS_DEPLOYED_SHA_UNVERIFIED')<prod.indexOf('node scripts/persistent-capability-stress-live-proof.mjs'));
  assert.match(prod,/persistent-capability-stress-live-proof\.mjs/);
  assert.doesNotMatch(prod,/exit 1\s*$/m);
});

test('runner uses independent proof header and immediately rejects forbidden access',()=>{
  assert.match(runner,/'x-mel-parallel-proof': TOKEN/);
  assert.doesNotMatch(runner,/x-mel-launch-bootstrap/);
  assert.match(runner,/CAPABILITY_STRESS_EXACT_SHA_REQUIRED/);
  assert.match(runner,/CAPABILITY_STRESS_AUTH_REJECTED/);
  assert.match(runner,/CAPABILITY_STRESS_STATUS_AUTH_REJECTED/);
  assert.match(runner,/CAPABILITY_STRESS_RUNTIME_FAILURES/);
});

test('pull request contract must not run the live production proof',()=>{
  const contract=source.slice(source.indexOf('  contract:\n'),source.indexOf('  production-proof:\n'));
  assert.match(contract,/if: github\.event_name == 'pull_request'/);
  assert.match(contract,/node --test/);
  assert.doesNotMatch(contract,/cloudflare\.com|wrangler secret/);
});
