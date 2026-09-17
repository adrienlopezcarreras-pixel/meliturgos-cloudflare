import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { AUTONOMY_RUNTIME_CRON } from '../src/evolution/autonomy-schedule.js';

const ROOT = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('deployed worker exposes the canonical persistent autonomy heartbeat', async () => {
  const wrangler = JSON.parse(await text('wrangler.jsonc'));

  assert.equal(wrangler.main, 'src/visual-final-entry.js');
  assert.deepEqual(wrangler.triggers?.crons, [AUTONOMY_RUNTIME_CRON]);
  assert.deepEqual(wrangler.env?.preview?.triggers?.crons, [], 'preview must not run a second heartbeat');

  const delegationChain = [
    'src/visual-final-entry.js',
    'src/preview-auth-entry.js',
    'src/professor-live-learning-entry.js',
    'src/ui-release-fix-entry.js',
    'src/ui-entry.js',
    'src/learning-entry.js',
  ];

  for (const path of delegationChain) {
    const source = await text(path);
    assert.match(source, /scheduled\s*\([^)]*\)\s*\{[^}]*app\.scheduled\s*\(/s, `${path} must delegate scheduled events`);
  }

  const finalVisual = await text('src/visual-final-entry.js');
  assert.match(finalVisual, /import\s+app\s+from\s+["']\.\/preview-auth-entry\.js["']/, 'final visual entrypoint must delegate to preview-auth-entry.js');

  const canonical = await text('src/index.js');
  assert.match(canonical, /async\s+scheduled\s*\([^)]*\)/, 'canonical entrypoint must expose scheduled()');
  assert.match(canonical, /runAutonomyRuntimeTick\s*\(env\)/, 'scheduled() must execute the autonomy runtime tick');
});

test('autonomy status reports the same cadence deployed by Wrangler', async () => {
  const api = await text('src/evolution/autonomy-api.js');
  assert.match(api, /runtime_schedule:\s*AUTONOMY_RUNTIME_CRON/);
  assert.equal(api.includes("runtime_schedule: '*/15 * * * *'"), false);
});


test('legacy OpenHands queue cannot become a second scheduler', async () => {
  const priority = await text('docs/CURRENT-PRIORITY.md');
  const runbook = await text('docs/AUTONOMY-RUN.md');
  const legacyAlias = await text('docs/OPENHANDS-INTEGRATION-QUEUE.md');

  assert.match(priority, /CURRENT_TASK=CANONICAL_MASTER_ROADMAP/);
  assert.match(priority, /SOURCE=src\/roadmap\/master-roadmap\.js/);
  assert.match(priority, /LEGACY_OPENHANDS_QUEUE=ARCHIVED_DO_NOT_EXECUTE/);
  assert.doesNotMatch(priority, /CURRENT_TASK=M\d{3}/);

  assert.match(runbook, /src\/roadmap\/master-roadmap\.js/);
  assert.match(runbook, /only authority that selects the next roadmap item/i);
  assert.doesNotMatch(runbook, /then `docs\/OPENHANDS-INTEGRATION-QUEUE\.md`/);

  assert.match(legacyAlias, /ARCHIVED \/ DO NOT EXECUTE AS AN ACTIVE QUEUE/);
  assert.match(legacyAlias, /must not compete with MEL's runtime roadmap/);
});
