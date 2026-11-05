import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('GEN2-42 tick uses GitHub Actions OIDC and no Cloudflare D1/R2 or Worker secret mutation', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /id-token:\s*write/);
  assert.match(source, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(source, /audience=meliturgos-worker/);
  assert.match(source, /x-mel-github-oidc: \$OIDC_TOKEN/);
  assert.doesNotMatch(source, /create-gen2-42-bootstrap-challenge\.mjs/);
  assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(source, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(source, /MEL_R2_BUCKET/);
  assert.doesNotMatch(source, /wrangler secret put MEL_GEN2_42_BOOTSTRAP_TOKEN/);
});

test('GEN2-42 production tick shares the release-proof concurrency group and never cancels active stress', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /  tick:\s*\n[\s\S]*?    concurrency:\s*\n      group: mel-launch-bootstrap-token/);
  assert.doesNotMatch(source.slice(0, source.indexOf('jobs:')), /^concurrency:/m);
  assert.match(source, /cancel-in-progress:\s*false/);
  assert.match(source, /SKIPPED_LEASE_BUSY/);
});

test('GEN2-42 records lease contention without inventing progress or recursively dispatching', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  assert.match(source, /AUTONOMY_LEASE_CONTENTION_DEFERRED/);
  assert.doesNotMatch(source, /AUTONOMY_LEASE_BUSY_AFTER_RETRIES/);
  assert.match(source, /if \[ "\$BLOCK" = "AUTONOMY_RUNTIME_LEASE_BUSY" \]; then\s+echo "AUTONOMY_CHAIN_DEFERRED_LEASE_BUSY"\s+exit 0/);
  assert.match(source, /tick_status:body\?\.tick_status\|\|null/);
  assert.match(source, /advanced:body\?\.advanced===true/);
});

test('GEN2-42 targeted mission exits both dispatch paths before reading tick proof or scheduling any unscoped work', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-runtime-tick.yml', import.meta.url), 'utf8');
  const steps = [
    ['Dispatch approved package to primary cloud executor', 'Continue event-driven autonomy while work is advancing'],
    ['Continue event-driven autonomy while work is advancing', 'Upload sanitized tick proof'],
  ];
  for (const [name, nextName] of steps) {
    const marker = `      - name: ${name}\n`;
    const nextMarker = `      - name: ${nextName}\n`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `missing step: ${name}`);
    const end = source.indexOf(nextMarker, start + marker.length);
    assert.notEqual(end, -1, `missing next step after ${name}`);
    const section = source.slice(start, end);
    assert.ok(section.includes("ONLY_JOB_ID: ${{ inputs.only_job_id || '' }}"), `missing focused input in ${name}`);
    const scriptStart = section.indexOf('        run: |\n');
    assert.notEqual(scriptStart, -1, `missing Bash script for ${name}`);
    const script = section.slice(scriptStart + '        run: |\n'.length)
      .split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 3000,
      env: { ...process.env, ONLY_JOB_ID: 'mel-founder-01', CHAIN_DEPTH: '0', GH_TOKEN: 'not-required' },
    });
    assert.equal(result.status, 0, `${name}: ${result.stderr || result.error || ''}`);
    assert.match(result.stdout, /FOCUSED_TICK_NO_AUTOMATIC_CHAIN/, name);
    assert.doesNotMatch(result.stdout, /CLOUD_BRIDGE_DISPATCHED|AUTONOMY_CHAIN_CONTINUED/, name);
  }
});
