import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { __launchBootstrapTest } from '../src/evolution/release-launch-bootstrap.js';

test('roadmap configuration explicitly pauses ShardVault external replication', async () => {
  const wrangler = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(wrangler.vars.MEL_SHARDVAULT_ENABLED, 'false');
  assert.equal(wrangler.vars.MEL_SHARDVAULT_AUTONOMOUS, 'false');
  assert.equal(wrangler.vars.MEL_SHARDVAULT_ROADMAP_PAUSED, 'true');
  assert.equal(wrangler.env.preview.vars.MEL_SHARDVAULT_ENABLED, 'false');
  assert.equal(wrangler.env.preview.vars.MEL_SHARDVAULT_AUTONOMOUS, 'false');
  assert.equal(wrangler.env.preview.vars.MEL_SHARDVAULT_ROADMAP_PAUSED, 'true');
});

test('release workflow skips only external ShardVault proof while roadmap pause is active', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /MEL_ROADMAP_SHARDVAULT_PAUSED: 'true'/);
  assert.match(workflow, /ShardVault external replication is PAUSED_FOR_ROADMAP/);
  assert.match(workflow, /if \[ "\$MEL_ROADMAP_SHARDVAULT_PAUSED" = "true" \]/);
  assert.match(workflow, /for PAUSE_ATTEMPT in \$\(seq 1 12\); do/);
  assert.match(workflow, /Launch pause propagation attempt/);
  assert.match(workflow, /test "\$PAUSE_READY" = "1"/);
  assert.match(workflow, /PRODUCTION_SHARDVAULT_ACTIVE_EXTERNAL_LT_7/);
  assert.match(workflow, /PRODUCTION_SHARDVAULT_EXTERNAL_LT_7/);
  assert.match(workflow, /Production authenticated \/api\/chat code\.read \+ code\.search smoke passed/);
  assert.match(workflow, /Production D1 observability metrics smoke passed/);
  assert.match(workflow, /Production GEN2-48 isolated recovery drill passed/);
});

test('release bootstrap preserves explicit ShardVault pause provenance', () => {
  const safe = __launchBootstrapTest.safeReadiness({
    ok: true,
    status: 'GO_FOR_SUPERVISED_AUTONOMY',
    launch_ready: true,
    shardvault: {
      ok: true,
      status: 'PAUSED_FOR_ROADMAP',
      paused: true,
      temporary: true,
      resume_condition: 'ROADMAP_COMPLETE',
      recoverable: false,
      active_external_count: 0,
      external_code_status: 'PAUSED_FOR_ROADMAP',
      external_code_endpoints: 0,
      target_count: 7,
    },
  });
  assert.equal(safe.shardvault.ok, true);
  assert.equal(safe.shardvault.paused, true);
  assert.equal(safe.shardvault.temporary, true);
  assert.equal(safe.shardvault.resume_condition, 'ROADMAP_COMPLETE');
  assert.equal(safe.shardvault.recoverable, false);
  assert.equal(safe.shardvault.active_external_count, 0);
});
