import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Only working post-release proofs may claim an exact expected SHA.
// Persistent stress must fail closed unless the independently authenticated
// exact-SHA production proof reaches a durable COMPLETE result.
const workflows = [
  'activate-platform-capabilities.yml',
  'live-connections-production-proof.yml',
  'mel-sov-01-live-proof.yml',
  'council-rich-ui-production-proof.yml',
];
const disabledProof = 'persistent-capability-stress-live-proof.yml';

test('post-release production proofs are reusable and no longer race on workflow_run', async () => {
  for (const name of workflows) {
    const source = await readFile(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
    assert.match(source, /workflow_call:/, name);
    assert.doesNotMatch(source, /workflows:\s*\["deploy-cloudflare-release"\]/, name);
    const directSha = /inputs\.expected_sha \|\| github\.sha/.test(source);
    const envResolvedSha = /INPUT_SHA:\s*\$\{\{ inputs\.expected_sha \}\}/.test(source)
      && /FALLBACK_SHA:\s*\$\{\{ github\.sha \}\}/.test(source)
      && /SHA="\$\{INPUT_SHA:-\$\{FALLBACK_SHA\}\}"/.test(source);
    assert.equal(directSha || envResolvedSha, true, name);
  }
});

test('persistent stress is independently authenticated and requires exact SHA proof', async () => {
  const source=await readFile(new URL('../../.github/workflows/'+disabledProof,import.meta.url),'utf8');
  assert.match(source,/workflow_call:/);
  assert.match(source,/production-proof:\n\s+if: github\.event_name != 'pull_request'/);
  assert.match(source,/MEL_BACKUP_ENCRYPTION_KEY_B64/);
  assert.match(source,/x-mel-parallel-proof/);
  assert.match(source,/STRESS_DEPLOYED_SHA_UNVERIFIED/);
  assert.match(source,/node scripts\/persistent-capability-stress-live-proof\.mjs/);
  assert.doesNotMatch(source,/wrangler\s+secret\s+(?:put|delete)|MEL_LAUNCH_BOOTSTRAP_TOKEN/);
});

test('post-release proofs use the same immutable release SHA; shared-lease proofs run in turn', async () => {
  const source = await readFile(new URL('../../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8');
  const section = name => source.split('\n  ' + name + ':')[1]?.split(/\n  [a-z][a-z-]*:/m)[0] || '';
  // Independent proofs fan out directly from the resolved SHA.
  for (const name of ['platform', 'workers-ai-proof-refresh', 'connections']) {
    assert.match(section(name), /needs: resolve\n/, name);
  }
  // Proofs sharing the production lease group are chained (GitHub cancels
  // all but one pending run of a concurrency group), each still runs always().
  assert.match(section('persistent-stress'), /needs: \[resolve, platform\]/);
  assert.match(section('council-rich-ui'), /needs: \[resolve, persistent-stress\]/);
  assert.match(section('sovereignty'), /needs: \[resolve, council-rich-ui\]/);
  for (const name of ['persistent-stress', 'council-rich-ui', 'sovereignty']) {
    assert.match(section(name), /if: always\(\) && needs\.resolve\.result == 'success'/, name);
    assert.match(section(name), /expected_sha: \$\{\{ needs\.resolve\.outputs\.expected_sha \}\}/, name);
  }
  assert.match(source, /summary:\n\s+needs: \[resolve, platform, persistent-stress, workers-ai-proof-refresh, council-rich-ui, connections, sovereignty\]/);
  assert.match(source, /if\(values\.some\(value=>value!=='success'\)\) process\.exit\(1\)/);
});

test('post-release parent grants actions write required by called platform proof', async () => {
  const source = await readFile(new URL('../../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8');
  assert.match(source, /permissions:\n\s+contents: read\n\s+actions: write/);
});


test('reusable production jobs do not require event_name workflow_call', async () => {
  for (const name of workflows) {
    const source = await readFile(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /github\.event_name\s*==\s*['"]workflow_call['"]/, name);
  }
});


test('canonical deployment cannot be green before the post-release health suite is green', async () => {
  const [deploy, suite] = await Promise.all([
    readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8'),
    readFile(new URL('../../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(deploy, /deploy:\n(?:\s*#[^\n]*\n)*\s+concurrency:\n\s+group:\s*mel-launch-bootstrap-token/);
  assert.match(deploy, /post-release-health:\n[\s\S]*needs:\s*deploy[\s\S]*uses:\s*\.\/\.github\/workflows\/post-release-proof-suite\.yml/);
  assert.match(deploy, /name:\s*post-release-health-gate/);
  assert.match(suite, /workflow_call:/);
  assert.doesNotMatch(suite, /workflow_run:/);
  assert.match(suite, /resolve:\n\s+if:\s*github\.event_name != 'pull_request'/);
});


test('Council proof refresh is short-lived, fail-closed and not silently cancelled', async () => {
  const [refresh, suite] = await Promise.all([
    readFile(new URL('../../.github/workflows/workers-ai-zero-cost-proof-refresh.yml', import.meta.url), 'utf8'),
    readFile(new URL('../../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(refresh, /workflow_call:/);
  assert.match(refresh, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(refresh, /cancel-in-progress: false/);
  assert.match(refresh, /accounts\/\$\{CLOUDFLARE_ACCOUNT_ID\}\/entitlements/);
  assert.match(refresh, /node scripts\/publish-zero-cost-proof-sql\.mjs/);
  assert.doesNotMatch(refresh, /wrangler\s+(?:versions|secret|deploy|publish)\b/);
  assert.match(refresh, /expires_at:new Date\(now\+60\*60\*1000\)/);
  assert.match(suite, /WORKERS_AI_PROOF_REFRESH: \$\{\{ needs\.workers-ai-proof-refresh\.result \}\}/);
  assert.match(suite, /proof\.workers_ai_proof_refresh/);
});

test('all production mutation workflows retain one shared FIFO queue instead of cancelling pending releases', async () => {
  // GitHub Actions defaults to one pending job per concurrency group, silently
  // cancelling the previous one. The canonical release + autonomous/proof
  // workflows must use the same protected lane with the supported queue:max.
  const protectedWorkflows = [
    'deploy-cloudflare-release.yml',
    'gen2-42-runtime-tick.yml',
    'mel-sov-01-live-proof.yml',
    'persistent-capability-stress-live-proof.yml',
    'activate-platform-capabilities.yml',
    'council-rich-ui-production-proof.yml',
  ];
  for (const name of protectedWorkflows) {
    const source = await readFile(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
    assert.match(source, /concurrency:\s*\n\s+group:[^\n]*mel-launch-bootstrap-token[^\n]*\n\s+cancel-in-progress:\s*false\n\s+queue:\s*max\b/, name);
  }
});

test('an official release retains its serving SHA until downstream proofs finish without deadlocking child probes', async () => {
  const source = await readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const parent = source.slice(0, source.indexOf('\njobs:'));
  const pipeline = parent.match(/^concurrency:\n\s+group:\s*(\S+)\n\s+cancel-in-progress:\s*false\n\s+queue:\s*max/m);
  assert.ok(pipeline, 'all official releases, including manual dispatch, must queue until the complete previous run finishes');
  assert.equal(pipeline[1], 'mel-production-release-pipeline');
  assert.notEqual(pipeline[1], 'mel-launch-bootstrap-token', 'the parent must not hold the child proof identity lane');
  assert.match(source, /deploy:\n(?:\s*#[^\n]*\n)*\s+concurrency:\n\s+group:\s*mel-launch-bootstrap-token/);
  assert.match(source, /post-release-health:\n[\s\S]*needs:\s*deploy/);
  assert.match(source, /Require explicit production approval/);
  assert.doesNotMatch(parent, /cancel-in-progress:\s*true/);
});
