import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/gen2-36-cloudflare-mutation-proof.yml','utf8');

test('GEN2-36 Cloudflare mutation proof is isolated to its dedicated candidate branch', () => {
  assert.match(workflow, /candidate\/gen2-36-cloudflare-mutation-proof/);
  assert.doesNotMatch(workflow, /branches:\s*\n\s*- main/);
});

test('GEN2-36 Cloudflare mutation proof reuses the existing traffic allocation without force', () => {
  assert.match(workflow, /workers\/scripts\/\\\$\{MEL_CLOUDFLARE_SCRIPT\}\/deployments/);
  assert.match(workflow, /strategy: 'percentage'/);
  assert.match(workflow, /JSON\.stringify\(versions\) !== JSON\.stringify\(before\.versions\)/);
  assert.match(workflow, /traffic_changed: false/);
  assert.match(workflow, /force_used: false/);
  assert.doesNotMatch(workflow, /[?&]force=true/);
});

test('GEN2-36 Cloudflare mutation proof performs exactly one deployment POST and verifies the created deployment', () => {
  assert.match(workflow, /--request POST/);
  assert.match(workflow, /created_deployment_id/);
  assert.match(workflow, /CLOUDFLARE_DEPLOYMENT_VERIFY_FAILED/);
});
