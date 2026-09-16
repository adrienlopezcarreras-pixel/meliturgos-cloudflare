import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CURRENT_CANDIDATE = 'candidate/mel-security-env-fix-20260916';
const OBSOLETE_CANDIDATE = 'candidate/mel-clean-autonomy';

async function source(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('release UI preserves themed avatars and explains Lancer in French', async () => {
  const ui = await source('src/ui-release-fix-entry.js');
  assert.doesNotMatch(ui, /160-q55/i, 'low-quality forced avatar must not return');
  assert.match(ui, /Teacher → développement → tests → preview et garde-fous/);
  assert.match(ui, /La boucle continue jusqu’à STOP/);
  assert.match(ui, /WAITING_TEACHER:'La demande est chez Teacher/);
  assert.match(ui, /HD_BACKGROUNDS\.classic/);
  assert.match(ui, /HD_BACKGROUNDS\.control/);
  assert.match(ui, /querySelector\('\.avatar'\)/);
});

test('Professor entry forwards scheduled events to the server runtime', async () => {
  const professor = await source('src/professor-live-learning-entry.js');
  const releaseUi = await source('src/ui-release-fix-entry.js');
  assert.match(professor, /async scheduled\(controller, env, ctx\)/);
  assert.match(professor, /return app\.scheduled\(controller, env, ctx\)/);
  assert.match(releaseUi, /async scheduled\(controller, env, ctx\)/);
  assert.match(releaseUi, /return app\.scheduled\(controller, env, ctx\)/);
});

test('autonomy runtime has pause, lease, quarantine and next-work safeguards', async () => {
  const runtime = await source('src/evolution/autonomy-runtime.js');
  assert.match(runtime, /if \(control\.paused\)/);
  assert.match(runtime, /tryAcquireAutonomyRuntimeLease/);
  assert.match(runtime, /SKIPPED_LEASE_BUSY/);
  assert.match(runtime, /retry-then-quarantine/);
  assert.match(runtime, /recovered_after_quarantine/);
  assert.match(runtime, /ensureNextRuntimeJob/);
  assert.match(runtime, /production_release_allowed: false/);
});

test('critical candidate configuration uses only the current candidate', async () => {
  const paths = [
    'wrangler.jsonc',
    'src/evolution/autonomy-runtime.js',
    '.github/workflows/full-candidate-ci.yml',
    '.github/workflows/deploy-candidate-preview.yml',
    'tests/integration/self-dev-e2e.test.mjs',
  ];
  for (const path of paths) {
    const text = await source(path);
    assert.doesNotMatch(text, new RegExp(OBSOLETE_CANDIDATE.replaceAll('/', '\\/')), `${path} still references obsolete candidate`);
    assert.match(text, new RegExp(CURRENT_CANDIDATE.replaceAll('/', '\\/')), `${path} does not reference current candidate`);
  }
});

test('preview is isolated from production cron execution', async () => {
  const config = JSON.parse((await source('wrangler.jsonc')).replace(/^\s*\/\/.*$/gm, ''));
  assert.deepEqual(config.triggers?.crons, ['* * * * *']);
  assert.deepEqual(config.env?.preview?.triggers?.crons, []);
  assert.equal(config.env?.preview?.vars?.MEL_PREVIEW_ISOLATED, 'true');
  assert.equal(config.env?.preview?.vars?.MEL_RUNTIME_ENV, 'preview');
  assert.equal(config.env?.preview?.vars?.MEL_GITHUB_BRANCH, CURRENT_CANDIDATE);
  assert.equal(config.env?.preview?.vars?.MEL_TEACHER_BRANCH, CURRENT_CANDIDATE);
});
