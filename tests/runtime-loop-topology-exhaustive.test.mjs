import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('runtime has one canonical scheduler topology with maintenance separated from minute autonomy', async () => {
  const [wrangler,index,visual,preview,professor,ui,learning,lease,lora,parallel,roadmapRefresh,fullControls,workLoop,collector] = await Promise.all([
    readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/visual-final-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/preview-auth-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/learning-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/evolution/autonomy-runtime-lease.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/learning/lora-training-heartbeat.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/augmentio/parallel-scheduler.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/roadmap-live-refresh-enhancer.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/full-mode-control-enhancer.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/work/autonomous-work-loop.js', import.meta.url), 'utf8'),
    readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8'),
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

  assert.match(parallel, /for \(let attempt = 0; attempt <= this\.retries; attempt \+= 1\)/);
  assert.match(parallel, /PROVIDER_TIMEOUT/);
  assert.match(parallel, /SCHEDULER_DEADLOCK/);
  assert.match(parallel, /clearTimeout\(timer\)/);
  assert.match(parallel, /circuitBreakerFailures/);

  assert.match(workLoop, /this\.maxCycles = Math\.max\(1, Math\.min\(32,/);
  assert.match(workLoop, /for \(let cycle = 0; cycle < this\.maxCycles; cycle \+= 1\)/);
  assert.match(workLoop, /AUTONOMOUS_WORK_LOOP_CYCLE_LIMIT/);

  assert.match(roadmapRefresh, /setInterval\(/);
  assert.match(roadmapRefresh, /clearInterval\(timer\)/);
  assert.match(roadmapRefresh, /panel\?\.classList\.contains\('active'\)/);
  assert.match(fullControls, /activityTimer=setInterval\(loadActivity,15000\)/);
  assert.match(fullControls, /clearInterval\(activityTimer\)/);
});

test('active branch unicity no longer exempts LoRA or compat development branches', async () => {
  const source = await readFile(new URL('../.github/workflows/canonical-branch-unicity.yml', import.meta.url), 'utf8');
  assert.match(source, /teacher-bridge\/runtime\|archive\/\*/);
  assert.doesNotMatch(source, /\*lora\*/i);
  assert.doesNotMatch(source, /compat-activateadapter-1/);
  assert.doesNotMatch(source, /compatfix-main/);
  assert.match(source, /Every active MEL code branch, including LoRA\/compat workspaces, must converge/);
  assert.match(source, /godot-private-test-\*/);
  assert.match(source, /ci-godot-test\//);
  assert.match(source, /GODOT_LAB_SCOPE_VIOLATION/);
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

test('no hidden workflow can deploy production outside the exact-SHA release workflow', async () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  const names = (await readdir(dir)).filter(name => /\.ya?ml$/i.test(name));
  const deployers = [];

  for (const name of names) {
    const source = await readFile(new URL(name, dir), 'utf8');
    if (!/wrangler\s+deploy/.test(source)) continue;
    deployers.push({ name, source });
  }

  assert.ok(deployers.length >= 1, 'expected at least the canonical release deploy workflow');
  const production = deployers.filter(({ source }) =>
    !/wrangler\s+deploy[^\n]*(?:--env\s+preview|--config\s+wrangler\.[^\s]*preview[^\s]*)/i.test(source)
  );
  assert.deepEqual(production.map(row => row.name), ['deploy-cloudflare-release.yml']);

  for (const row of deployers) {
    if (row.name === 'deploy-cloudflare-release.yml') continue;
    assert.match(row.source, /wrangler\s+deploy[^\n]*(?:--env\s+preview|--config\s+wrangler\.[^\s]*preview[^\s]*)/i, row.name + ' must be preview-only');
  }
});
