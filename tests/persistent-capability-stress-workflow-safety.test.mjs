import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('.github/workflows/persistent-capability-stress-live-proof.yml','utf8');

test('production stress proof cannot mutate Cloudflare production secrets',()=>{
  assert.doesNotMatch(source,/wrangler\s+secret\s+(put|delete)/);
  assert.doesNotMatch(source,/MEL_LAUNCH_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(source,/CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(source,/openssl\s+rand|printf 'y\\n'|npx\s+wrangler/);
});
test('unverified full stress explicitly fails closed without claiming green',()=>{
  const prod=source.slice(source.indexOf('  production-proof:\n'));
  assert.match(prod,/if: github\.event_name != 'pull_request'/);
  assert.match(prod,/PERSISTENT_STRESS_LIVE_PROOF_DISABLED_UNSAFE_PRODUCTION_SECRET_MUTATION/);
  assert.match(prod,/Full 165-capability runtime stress is NOT VERIFIED/);
  assert.match(prod,/exit 1/);
  assert.doesNotMatch(prod,/persistent-capability-stress-live-proof\.mjs/);
});
test('contract-only tests are not represented as proof of production stress',()=>{
  const contract=source.slice(source.indexOf('  contract:\n'),source.indexOf('  production-proof:\n'));
  assert.match(contract,/if: github\.event_name == 'pull_request'/);
  assert.match(contract,/node --test/);
  assert.doesNotMatch(contract,/cloudflare\.com|wrangler secret/);
});
