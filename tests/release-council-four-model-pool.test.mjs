import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultAugmentioPool } from '../src/augmentio/default-pool.js';
import { standardRegistry } from '../src/models/ModelRegistry.js';
import { evaluateCouncilReleaseProof } from '../scripts/check-release-council-proof.mjs';

const workflow = readFileSync('.github/workflows/deploy-cloudflare-release.yml', 'utf8');
const councilSection = workflow.slice(workflow.indexOf('# MEL-COUNCIL-02: four bounded'), workflow.indexOf('# GEN2-38: prove pure planning'));

test('production Council probe selects four bounded independent model candidates', () => {
  assert.match(councilSection, /"id":"model.council"/);
  assert.match(councilSection, /"maxCandidates":4,"timeoutMs":15000/);
  assert.match(councilSection, /node scripts\/check-release-council-proof\.mjs production-mel-council-02\.json/);
  const distinct = new Set(standardRegistry.list().filter(m => m.enabled && m.provider === 'workers-ai' && m.capabilities.includes('GENERAL')).map(m => m.model_id));
  assert.ok(distinct.size >= 4);
});
test('fourth candidate remains subject to exact zero-euro provenance and cannot fake quorum', async () => {
  const pool = createDefaultAugmentioPool({ AI: { run: async () => ({ response: 'test-only' }) } });
  const candidates = pool.list({ capability: 'GENERAL' }).filter(p => p.providerId === 'workers-ai');
  assert.ok(candidates.length >= 4);
  // The first three replies may fail: a single fourth reply is still insufficient.
  const sample = { ok:true, capability:'model.council', result: {
    critiques:[{identity:'workers-ai::fourth',provenance:{provider:'workers-ai',model:'fourth'},cost:{allowed:true,policy:'MEL_ZERO_EURO_V1'}}],
    independent_response_count:1, unique_model_count:1, provider_failure_count:3,
    synthesis:{status:'COMPLETE',text:'one response'}
  }};
  assert.equal(evaluateCouncilReleaseProof(sample).code, 'MEL_COUNCIL_02_INDEPENDENT_CRITIQUES_MISSING');
});
