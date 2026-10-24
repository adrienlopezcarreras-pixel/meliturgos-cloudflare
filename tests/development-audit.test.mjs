import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDevelopment, excludedCodeModels, probeCodeModels } from '../src/diagnostics/development-audit.js';
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
  assert.ok(excludedCodeModels({}).includes('@cf/moonshotai/kimi-k2.7-code'));
  const report = auditDevelopment({ now: NOW, jobs: [] });
  assert.ok(report.findings.some(f => f.code === 'CODE_MODEL_EXCLUDED_BY_ZERO_COST_PROOF'));
});

test('a mission retried four times in a week is a loop', () => {
  const jobs = Array.from({ length: 4 }, () => job({ status: 'FAILED', optional_context: { roadmap_id: 'MEL-X' } }));
  assert.ok(auditDevelopment({ now: NOW, jobs }).findings.some(f => f.code === 'MISSION_LOOP' && f.detail.includes('MEL-X ×4')));
});

test('each code model is really tested on a small exercise', async () => {
  const env = { AI: { async run(model) {
    if (model.includes('glm-5.3-flash')) return { response: 'pas de code' };
    return { response: '```js\nfunction sumEven(list){return list.filter(n=>n%2===0).reduce((a,b)=>a+b,0)}\n```' };
  } } };
  const probes = await probeCodeModels(env);
  assert.ok(probes.length >= 4);
  assert.equal(probes.find(p => p.model.includes('glm-5.3-flash')).passed, false);
  assert.ok(probes.filter(p => !p.model.includes('glm-5.3-flash')).every(p => p.passed));
  const report = auditDevelopment({ now: NOW, jobs: [], probes });
  assert.ok(report.findings.some(f => f.code === 'CODE_MODEL_PROBE_FAILED' && f.detail.includes('glm-5.3-flash')));
});

test('MAX codes only with code models: small ones first, large ones after three failures', () => {
  const pool = createDefaultAugmentioPool({ AI: { run: async () => null } });
  const specialists = pool.list({ capability: 'CODE_SPECIALIST' }).map(p => p.modelId);
  assert.deepEqual(specialists.slice(0, 2), ['@cf/moonshotai/kimi-k2.7-code', '@cf/zai-org/glm-5.3']);
  assert.ok(!pool.list({ capability: 'GENERAL' }).some(p => specialists.includes(p.modelId)));
  assert.ok(standardRegistry.list().filter(m => (m.capabilities || []).includes('CODE_LARGE')).length === 2);
});
