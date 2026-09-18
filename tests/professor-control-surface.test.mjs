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
  assert.ok(!sourceHasHref(page, '/professor-legacy'), 'legacy compatibility route must not appear as a second Professor UI');
  assert.ok(router.includes('/professor-legacy'), 'legacy bookmark redirect is missing');
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

test('manual autonomy control is canonical in the top Professor controls and uses real authenticated endpoints', async () => {
  const [ui, controls, autonomy] = await Promise.all([
    read('src/ui-entry.js'),
    read('src/pages/full-mode-control-enhancer.js'),
    read('src/evolution/autonomy-api.js'),
  ]);
  assert.ok(controls.includes('/api/gen2/autonomy/state'), 'canonical activity panel must read autonomy state');
  assert.ok(controls.includes('/api/gen2/autonomy/tick'), 'top control must execute the autonomy tick');
  assert.ok(controls.includes('id="melFullCycle"'), 'canonical top cycle button is missing');
  assert.ok(!ui.includes('/api/gen2/autonomy/state'), 'API entry layer must not own a second live autonomy reader');
  assert.ok(!ui.includes('/api/gen2/autonomy/tick'), 'API entry layer must not expose a second cycle actuator');
  for (const path of ['/api/gen2/autonomy/state', '/api/gen2/autonomy/tick']) {
    assert.ok(autonomy.includes(path), `autonomy backend missing ${path}`);
  }
  assert.ok(autonomy.includes('requireAuth(request, env)'), 'state-changing autonomy routes must remain authenticated');
  assert.ok(autonomy.includes('runAutonomyRuntimeTick'), 'autonomy tick must execute the real runtime');
});

test('full mode exposes the zero-cost LoRA pipeline with real status endpoint and external handoff links', async () => {
  const [page, entry, notebook, agenticNotebook, workflow] = await Promise.all([
    read('src/pages/full-interface-v2.js'),
    read('src/professor-live-learning-entry.js'),
    read('notebooks/MEL-QLORA-UNCENSORED-MAX-COLAB.ipynb'),
    read('notebooks/MEL-QLORA-AGENTIC-MAX-COLAB.ipynb'),
    read('.github/workflows/lora-promote-from-huggingface.yml'),
  ]);
  for (const id of ['freeLoraRefresh', 'freeLoraColab', 'freeLoraHf', 'freeLoraWorkflow', 'freeRuntimeState', 'freeTrainingExamples', 'freeCheckpointStage', 'freeCompatibleLoras', 'freeAgenticState', 'freeAgenticColab']) {
    assert.ok(sourceHasHtmlId(page, id), `missing free LoRA UI control #${id}`);
  }
  assert.ok(page.includes("data-view=\"lora\""), 'LoRA free panel is missing from full-mode navigation');
  assert.ok(page.includes('/api/learning/lora/free-status'), 'full mode does not read the free LoRA status endpoint');
  assert.ok(entry.includes("'/api/learning/lora/free-status'"), 'free LoRA status route is missing');
  assert.ok(entry.includes("cost_policy: 'NO_PAID_GPU_TRIGGER'"), 'free LoRA status must explicitly forbid paid GPU triggers');
  assert.ok(entry.includes("Meliturgos/mel-lora-uncensored"), 'free LoRA status lost the canonical Hugging Face bundle');
  assert.ok(notebook.includes('scripts/publish-lora-hf.py'), 'Colab notebook no longer publishes the trained bundle');
  assert.ok(notebook.includes('scripts/prepare-mel-max-lora.py'), 'UNCENSORED MAX notebook no longer builds the maximal verbatim corpus');
  assert.ok(notebook.includes('--stage'), 'UNCENSORED MAX notebook no longer pins the training stage');
  assert.ok(notebook.includes('resume-from-checkpoint'), 'UNCENSORED MAX notebook lost resumable training');
  assert.ok(notebook.includes('Meliturgos/mel-lora-uncensored'), 'Colab notebook no longer targets the canonical free bundle repo');
  assert.ok(workflow.includes('default: "Meliturgos/mel-lora-uncensored"'), 'promotion workflow lost its zero-entry default repository');
  assert.ok(workflow.includes('activate_preview'), 'promotion workflow must keep preview activation explicit');
  assert.ok(entry.includes('MEL-QLORA-AGENTIC-MAX-COLAB.ipynb'), 'free LoRA status must expose the gated AGENTIC notebook');
  assert.ok(page.includes("impact.next_stage||''")==false || page.includes("AGENTIC_READY"), 'full mode must gate AGENTIC on measured impact');
  assert.ok(agenticNotebook.includes("AGENTIC_READY = False"), 'AGENTIC notebook must fail closed before the gate is approved');
  assert.ok(agenticNotebook.includes("--parent-adapter-dir"), 'AGENTIC notebook must continue from the UNCENSORED parent');
  assert.ok(agenticNotebook.includes("--parent-artifact-digest"), 'AGENTIC notebook must bind the exact UNCENSORED parent digest');
  assert.ok(agenticNotebook.includes("Meliturgos/mel-lora-agentic"), 'AGENTIC notebook must publish to a separate repository');
});
