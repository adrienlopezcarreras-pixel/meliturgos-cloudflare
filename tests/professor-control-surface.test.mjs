import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const canonicalButtonHandlers = Object.freeze({
  chatSend: ['#chatSend', 'sendChat'],
  refreshSkills: ['#refreshSkills', 'loadSkills'],
  multiRun: ['#multiRun', '/api/gen2/augmentio/fanout'],
  workCreate: ['#workCreate', '/api/dev-bridge/jobs'],
  workRefresh: ['#workRefresh', 'loadWork'],
  memoryRefresh: ['#memoryRefresh', 'loadMemory'],
  chatgptImport: ['#chatgptImport', '/api/import/chatgpt-context'],
  codeSelfCheck: ['#codeSelfCheck', '/api/gen2/code/self-check'],
  diagCaps: ['#diagCaps', '/api/gen2/capabilities'],
  diagRoadmap: ['#diagRoadmap', '/api/gen2/roadmap'],
  diagAug: ['#diagAug', 'augmentio.fanout'],
});

const canonicalApiPaths = Object.freeze([
  '/api/chat',
  '/api/gen2/capabilities',
  '/api/gen2/roadmap',
  '/api/gen2/code/self-check',
  '/api/gen2/augmentio/fanout',
  '/api/memory/status',
  '/api/export',
  '/api/import/chatgpt-context',
  '/api/dev-bridge/health',
  '/api/dev-bridge/jobs',
]);

function sourceHasHtmlId(source, id) {
  return source.includes(`id="${id}"`) || source.includes(`id=\\"${id}\\"`);
}

function sourceHasHref(source, href) {
  return source.includes(`href="${href}"`) || source.includes(`href=\\"${href}\\"`);
}

test('every canonical Professor button has a concrete client-side handler', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  for (const [id, evidence] of Object.entries(canonicalButtonHandlers)) {
    assert.ok(sourceHasHtmlId(source, id), `missing button #${id}`);
    for (const token of evidence) assert.ok(source.includes(token), `button #${id} lost handler evidence: ${token}`);
  }
  assert.ok(source.includes("qsa('#nav button').forEach"), 'navigation buttons lost generic handler');
  assert.ok(source.includes("qsa('[data-jump]').forEach"), 'overview jump buttons lost generic handler');
  assert.ok(source.includes("qs('#rmStatus').onchange=renderRoadmap"), 'roadmap status filter lost handler');
  assert.ok(source.includes("qs('#rmPriority').onchange=renderRoadmap"), 'roadmap priority filter lost handler');
});

test('every API path called by canonical Professor is implemented in the active Worker chain', async () => {
  const [page, index, router] = await Promise.all([
    read('src/pages/full-interface-v2.js'),
    read('src/index.js'),
    read('src/router.js'),
  ]);
  const backend = `${index}\n${router}`;
  for (const path of canonicalApiPaths) {
    assert.ok(page.includes(path), `canonical UI no longer references expected path ${path}`);
    assert.ok(backend.includes(path), `backend route missing for canonical UI path ${path}`);
  }
  assert.ok(sourceHasHref(page, '/professor-legacy'), 'legacy compatibility link missing in Professor');
  assert.ok(router.includes('/professor-legacy'), 'legacy compatibility link has no backend route');
});

test('injected learning controls are wired to authenticated Worker endpoints without duplicate benchmark ids', async () => {
  const [entry, actions] = await Promise.all([
    read('src/professor-live-learning-entry.js'),
    read('src/learning/operator-actions.js'),
  ]);
  for (const id of ['melRunBenchmark', 'melPrepareLora', 'melLearningActionState']) {
    assert.ok(entry.includes(id), `missing injected control ${id}`);
  }
  for (const path of ['/api/learning/benchmark/run', '/api/learning/lora/prepare']) {
    assert.ok(entry.includes(path), `missing learning endpoint ${path}`);
  }
  assert.ok(entry.includes('requireAuth(request, env)'), 'learning operator routes must remain authenticated');
  assert.ok(actions.includes('runLearningBenchmark'), 'benchmark action must execute the benchmark suite');
  assert.ok(actions.includes('recordBenchmark'), 'benchmark action must persist evidence');
  assert.ok(actions.includes('prepareLora'), 'LoRA action must build the persisted plan');
  assert.ok(actions.includes("available: false"), 'LoRA control must not pretend an external trainer exists');
  assert.ok(!entry.includes("['Benchmark','learnBenchmark']"), 'live learning patch must reuse the base benchmark row instead of duplicating its id');
});

test('Professor Work routes remain usable with owner auth while privileged bridge routes keep bridge-token protection', async () => {
  const [entry, index] = await Promise.all([
    read('src/professor-live-learning-entry.js'),
    read('src/index.js'),
  ]);
  assert.ok(entry.includes("'/api/dev-bridge/health'"), 'safe Work health path missing from Professor allowlist');
  assert.ok(entry.includes("'/api/dev-bridge/jobs'"), 'safe Work jobs path missing from Professor allowlist');
  assert.ok(entry.includes('!PROFESSOR_SAFE_DEV_BRIDGE_PATHS.has(url.pathname)'), 'bridge token protection must exclude only the safe Professor routes');
  assert.ok(entry.includes('authorizeDevBridge(request, env)'), 'privileged dev-bridge paths must retain bridge-token authorization');
  assert.ok(index.includes("mode: 'preflight-only'"), 'safe Professor Work route must remain preflight-only');
  assert.ok(index.includes('requireAuth(request, env)'), 'safe Professor Work route must retain owner authentication');
});

test('live autonomy controls point to real authenticated autonomy endpoints', async () => {
  const [ui, autonomy] = await Promise.all([
    read('src/ui-entry.js'),
    read('src/evolution/autonomy-api.js'),
  ]);
  for (const path of ['/api/gen2/autonomy/state', '/api/gen2/autonomy/tick']) {
    assert.ok(ui.includes(path), `live UI missing autonomy call ${path}`);
    assert.ok(autonomy.includes(path), `autonomy backend missing ${path}`);
  }
  assert.ok(autonomy.includes('requireAuth(request, env)'), 'state-changing autonomy routes must remain authenticated');
  assert.ok(autonomy.includes('runAutonomyRuntimeTick'), 'autonomy tick must execute the real runtime');
});
