import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDevelopment, excludedCodeModels, probeCodeModels } from '../src/diagnostics/development-audit.js';
import { upgradeFindingsFromCatalog } from '../scripts/workers-ai-catalog-diff.mjs';

test('workers AI catalog diff proposes upgrade finding for new models', () => {
  const catalog = { result: [
    { name: '@cf/new/coder-2', task: { name: 'Text Generation' } },
    { name: '@cf/openai/gpt-oss-120b', task: { name: 'Text Generation' } },
  ] };
  const findings = upgradeFindingsFromCatalog(catalog, ['@cf/openai/gpt-oss-120b']);
  assert.deepEqual(findings, [{ code: 'UPGRADE_MODEL_AVAILABLE', detail: '@cf/new/coder-2' }]);
});
import { standardRegistry } from '../src/models/ModelRegistry.js';
import { createDefaultAugmentioPool } from '../src/augmentio/default-pool.js';

const NOW = Date.parse('2026-10-24T10:00:00Z');
const job = (over) => ({ requested_by: 'mel-autonomy', updated_at: NOW - 3600_000, status: 'QUEUED', ...over });
const council = (selected) => ({ result_json: { bridge_preparation: { mentor: { council: { providers_attempted: [selected], selected_provider: selected, rejected_proposals: [] } } } } });

test('the weekly audit flags code written by a generalist model and a week without delivery', () => {
  const report = auditDevelopment({ now: NOW, jobs: [job(council('workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast'))] });
  const codes = report.findings.map(f => f.code);
  assert.equal(report.ok, false);
  assert.ok(codes.includes('MENTOR_CODED_WITH_NON_CODE_MODEL'));
  assert.ok(codes.includes('NO_DELIVERY_THIS_WEEK'));
});

test('a code model missing from the zero-cost proof is reported, not silently dropped', t => {
  const saved = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  t.after(() => { if (saved !== undefined) process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = saved; });
  assert.ok(excludedCodeModels({}).includes('@cf/qwen/qwen2.5-coder-32b-instruct'));
  const report = auditDevelopment({ now: NOW, jobs: [] });
  assert.ok(report.findings.some(f => f.code === 'CODE_MODEL_EXCLUDED_BY_ZERO_COST_PROOF'));
});

test('a mission retried four times in a week is a loop', () => {
  const jobs = Array.from({ length: 4 }, () => job({ status: 'FAILED', optional_context: { roadmap_id: 'MEL-X' } }));
  assert.ok(auditDevelopment({ now: NOW, jobs }).findings.some(f => f.code === 'MISSION_LOOP' && f.detail.includes('MEL-X ×4')));
});

test('each code model is really tested on a small exercise', async () => {
  const env = { AI: { async run(model) {
    if (model.includes('gpt-oss-120b')) return { response: 'pas de code' };
    return { response: '```js\nfunction sumEven(list){return list.filter(n=>n%2===0).reduce((a,b)=>a+b,0)}\n```' };
  } } };
  const probes = await probeCodeModels(env);
  assert.equal(probes.length, 2);
  assert.equal(probes.find(p => p.model.includes('gpt-oss-120b')).passed, false);
  assert.ok(probes.filter(p => !p.model.includes('gpt-oss-120b')).every(p => p.passed));
  const report = auditDevelopment({ now: NOW, jobs: [], probes });
  assert.ok(report.findings.some(f => f.code === 'CODE_MODEL_PROBE_FAILED' && f.detail.includes('gpt-oss-120b')));
});

test('MAX codes only with code models: small ones first, large ones after three failures', () => {
  const pool = createDefaultAugmentioPool({ AI: { run: async () => null } });
  const specialists = pool.list({ capability: 'CODE_SPECIALIST' }).map(p => p.modelId);
  assert.deepEqual(specialists, ['@cf/qwen/qwen2.5-coder-32b-instruct', '@cf/openai/gpt-oss-120b']);
  assert.ok(!specialists.includes('@cf/moonshotai/kimi-k2.7-code'));
  // The small code model never sits in the general Council; gpt-oss-120b is
  // both a general reviewer and the large free code model (GLM-5.3 Flash is paid).
  assert.ok(!pool.list({ capability: 'GENERAL' }).some(p => p.modelId === '@cf/qwen/qwen2.5-coder-32b-instruct'));
  assert.ok(!specialists.includes('@cf/zai-org/glm-5.3-flash'));
  assert.ok(standardRegistry.list().filter(m => (m.capabilities || []).includes('CODE_LARGE')).length === 1);
});

test('verified terminal statuses are counted as deliveries while queued work is not', () => {
  for (const status of ['COMPLETED', 'DONE', 'DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']) {
    const report = auditDevelopment({ now: NOW, jobs: [job({ status })] });
    assert.equal(report.summary.completed, 1, status);
    assert.ok(!report.findings.some(f => f.code === 'NO_DELIVERY_THIS_WEEK'), status);
  }
  const queued = auditDevelopment({ now: NOW, jobs: [job({ status: 'QUEUED' })] });
  assert.equal(queued.summary.completed, 0);
  assert.ok(queued.findings.some(f => f.code === 'NO_DELIVERY_THIS_WEEK'));
});

test('a successful code-model probe cancels its pending timeout', async t => {
  const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout, handles = [];
  globalThis.setTimeout = (callback, delay) => {
    const handle = { callback, delay, cleared: false };
    handles.push(handle);
    return handle;
  };
  globalThis.clearTimeout = handle => { handle.cleared = true; };
  t.after(() => { globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear; });
  const registry = { list: () => [{ id: 'test-coder', capabilities: ['CODE_SPECIALIST'] }] };
  const result = await probeCodeModels({
    AI: { run: async () => ({ response: 'function sumEven(list) { return list.filter(n => n % 2 === 0).reduce((a, n) => a + n, 0); }' }) }
  }, { registry, timeoutMs: 250 });
  assert.equal(result[0].passed, true);
  assert.equal(handles.length, 1);
  assert.equal(handles[0].cleared, true);
});

test('a timed-out code-model probe fails and clears its timer', async t => {
  const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout, handles = [];
  globalThis.setTimeout = (callback, delay) => {
    const handle = { callback, delay, cleared: false };
    handles.push(handle);
    queueMicrotask(callback);
    return handle;
  };
  globalThis.clearTimeout = handle => { handle.cleared = true; };
  t.after(() => { globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear; });
  const registry = { list: () => [{ id: 'unresponsive-coder', capabilities: ['CODE_SPECIALIST'] }] };
  const result = await probeCodeModels({
    AI: { run: () => new Promise(() => {}) }
  }, { registry, timeoutMs: 250 });
  assert.equal(result.length, 1);
  assert.equal(result[0].passed, false);
  assert.equal(result[0].error, 'PROBE_TIMEOUT');
  assert.equal(handles.length, 1);
  assert.equal(handles[0].cleared, true);
});
