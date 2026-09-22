import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderNormal } from '../src/pages/mvp-interface-v3.js';
import { onRequestGet as renderProfessor } from '../src/pages/full-interface-v2.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { SERVICE_WORKER_SOURCE } from '../src/pages/service-worker.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Professor hot path has one functional UI owner', async () => {
  const [html,index,learning] = await Promise.all([
    (await renderProfessor()).text(),
    read('src/index.js'),
    read('src/professor-live-learning-entry.js'),
  ]);
  assert.doesNotMatch(index,/mvp-behavior-enhancer|enhanceMvpBehavior/);
  assert.doesNotMatch(learning,/PROFESSOR_LIVE_LEARNING_PATCH|enhanceProfessorLearning/);
  assert.doesNotMatch(html,/mel-full-control-runtime|mel-roadmap-live-refresh-runtime|mel-work-truth-runtime|mel-professor-live-learning-runtime/);
  assert.match(html,/id="melFullCycle"/);
  assert.match(html,/id="melRunBenchmark"/);
  assert.match(html,/id="melPrepareLora"/);
});

test('Professor mobile controls are unambiguous and secondary navigation is collapsed', async () => {
  const html = await (await renderProfessor()).text();
  assert.match(html,/Mettre MEL en pause/);
  assert.match(html,/Veille des capacités/);
  assert.doesNotMatch(html,/<button id="mobilePauseAutonomy">Veille<\/button>/);
  assert.match(html,/id="mobileMoreNav"/);
  assert.match(html,/id="mobileMoreMenu"[^>]*hidden/);
});

test('Professor boot avoids automatic code self-check and refreshes live data only while visible', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  const boot = source.match(/async function boot\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(boot,/codeCheck\(/);
  assert.match(source,/if\(document\.hidden\)return/);
  assert.match(source,/active==='roadmap'/);
  assert.match(source,/active==='work'/);
});

test('normal file drop is keyboard accessible and runtime is versioned', async () => {
  const html = await (await renderNormal()).text();
  assert.match(html,/id="drop" role="button" tabindex="0" aria-label="Ajouter des fichiers"/);
  assert.match(html,/normal-runtime\.js\?v=6/);
  assert.match(NORMAL_RUNTIME_SOURCE,/drop\.addEventListener\('keydown'/);
});

test('service worker caches only static resources and leaves private HTML to the network', () => {
  assert.match(SERVICE_WORKER_SOURCE,/meliturgos-static-v6/);
  assert.match(SERVICE_WORKER_SOURCE,/staleWhileRevalidate/);
  assert.match(SERVICE_WORKER_SOURCE,/url\.pathname\.startsWith\('\/assets\/'\)/);
  assert.match(SERVICE_WORKER_SOURCE,/request\.mode==='navigate'.*return/);
  assert.doesNotMatch(SERVICE_WORKER_SOURCE,/cache\.add\('\/'\)|FALLBACK='\/'/);
});

test('normal runtime HTTP route has reusable cache headers', async () => {
  const router = await read('src/router.js');
  assert.match(router,/normal-runtime\.js/);
  assert.match(router,/public, max-age=86400, stale-while-revalidate=604800/);
});
