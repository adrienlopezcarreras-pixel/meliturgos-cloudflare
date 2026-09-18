import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('runtime has one canonical scheduler topology with maintenance separated from minute autonomy', async () => {
  const [wrangler,index,visual,preview,professor,ui,learning,lease,lora] = await Promise.all([
    readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/visual-final-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/preview-auth-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/learning-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/evolution/autonomy-runtime-lease.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/learning/lora-training-heartbeat.js', import.meta.url), 'utf8'),
  ]);

  const cfg = JSON.parse(wrangler);
  assert.deepEqual(cfg.triggers.crons, ['* * * * *', '17 * * * *']);

  assert.equal((index.match(/runAutonomyRuntimeTick\(env\)/g) || []).length, 1);
  assert.equal((index.match(/runAutonomyMaintenance\(env\)/g) || []).length, 1);
  assert.equal((index.match(/runEcosystemCapabilityWatch\(env,/g) || []).length, 1);
  assert.equal((index.match(/runLoraTrainingHeartbeat\(env\)/g) || []).length, 1);
  assert.match(index, /const maintenanceCron = cron === '17 \* \* \* \*'/);
  assert.match(index, /const tasks = maintenanceCron\s*\? \[/);
  assert.match(index, /:\s*\[\s*runAutonomyRuntimeTick/);

  for (const [name,source] of Object.entries({visual,preview,ui,learning})) {
    assert.equal((source.match(/app\.scheduled\(/g) || []).length, 1, name + ' must delegate scheduled exactly once');
    assert.doesNotMatch(source, /runAutonomyRuntimeTick\(/, name + ' must not own another autonomy loop');
  }

  assert.equal((professor.match(/app\.scheduled\(/g) || []).length, 1);
  assert.match(professor, /if \(String\(controller\?\.cron \|\| ''\) !== '17 \* \* \* \*'\) return/);
  assert.doesNotMatch(professor, /runAutonomyRuntimeTick\(/);
  assert.doesNotMatch(professor, /runEcosystemCapabilityWatch\(/);

  assert.match(lease, /ON CONFLICT\(bridge_id\) DO UPDATE SET/);
  assert.match(lease, /WHERE dev_bridge_state\.last_seen <= \?/);
  assert.match(lease, /WHERE bridge_id=\? AND status=\?/);

  assert.match(lora, /ACTIVE_RUN_STATES/);
  assert.match(lora, /TRAINING_CHAIN_ACTIVE/);
  assert.match(lora, /RETRY_BACKOFF/);
  assert.match(lora, /LOCAL_GATE_READY_FOR_CANONICAL_BENCHMARK/);
  assert.match(lora, /AGENTIC_READY/);
  assert.match(lora, /SKIPPED_PREVIEW/);
});

test('active branch unicity no longer exempts LoRA or compat development branches', async () => {
  const source = await readFile(new URL('../.github/workflows/canonical-branch-unicity.yml', import.meta.url), 'utf8');
  assert.match(source, /teacher-bridge\/runtime\|archive\/\*/);
  assert.doesNotMatch(source, /\*lora\*/i);
  assert.doesNotMatch(source, /compat-activateadapter-1/);
  assert.doesNotMatch(source, /compatfix-main/);
  assert.match(source, /Every active code branch, including LoRA\/compat workspaces, must converge/);
});

test('production deployment remains a single explicit exact-SHA release path', async () => {
  const release = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const canary = await readFile(new URL('../.github/workflows/gen2-53-canary-rollback.yml', import.meta.url), 'utf8');

  assert.match(release, /workflow_dispatch/);
  assert.match(release, /DEPLOY_APPROVED/);
  assert.match(release, /Prove release pointer equals the current canonical candidate/);
  assert.match(release, /wrangler deploy/);
  assert.match(release, /MEL_DEPLOYED_GIT_SHA/);
  assert.match(canary, /All production mutations go through deploy-cloudflare-release\.yml/);
  assert.doesNotMatch(canary, /wrangler deploy/);
});
