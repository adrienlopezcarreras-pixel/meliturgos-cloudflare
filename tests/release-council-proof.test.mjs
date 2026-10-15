import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCouncilReleaseProof } from '../scripts/check-release-council-proof.mjs';

const crit = (provider, model) => ({
  identity: provider + '::' + model,
  provenance: { provider, model },
  cost: { allowed: true, policy: 'MEL_ZERO_EURO_V1' },
});
const valid = () => ({
  ok: true, capability: 'model.council', result: {
    critiques: [crit('workers-ai', 'm1'), crit('workers-ai', 'm2')],
    independent_response_count: 2, unique_model_count: 2, provider_failure_count: 0,
    synthesis: { status: 'COMPLETE', text: 'A real synthesis' },
  },
});

test('release accepts two actual independent zero-euro critiques and synthesis', () => {
  const result = evaluateCouncilReleaseProof(valid());
  assert.equal(result.ok, true);
  assert.equal(result.code, 'MEL_COUNCIL_02_VERIFIED');
  assert.equal(result.summary.independently_identified_pairs, 2);
});
test('single critique blocks publication and prints safe failure diagnostics', () => {
  const v = valid();
  v.result.critiques = [crit('workers-ai', 'm1')];
  v.result.independent_response_count = 1;
  v.result.failures = [
    { code: 'PROVIDER_TIMEOUT', message: 'authorization: private-token-abcdef' },
    { code: 'credentials private-token-abcdef' },
  ];
  const result = evaluateCouncilReleaseProof(v);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MEL_COUNCIL_02_INDEPENDENT_CRITIQUES_MISSING');
  assert.deepEqual(result.summary.failure_codes, ['PROVIDER_TIMEOUT', 'PROVIDER_FAILURE_REDACTED']);
  assert.doesNotMatch(JSON.stringify(result), /private-token-abcdef/);
});
test('Council failure identifies only public model IDs and bounded error codes', () => {
  const v = valid();
  v.result.critiques = [crit('workers-ai', '@cf/meta/llama-3.3-70b-instruct-fp8-fast')];
  v.result.independent_response_count = 1;
  v.result.failures = [
    { identity: 'workers-ai::@cf/google/gemma-4-26b-a4b-it', code: 'EMPTY_WORKERS_AI_RESPONSE', message: 'secret-token-abc' },
    { identity: 'workers-ai::@cf/nvidia/nemotron-3-120b-a12b', code: 'PROVIDER_FAILED' },
    { identity: 'provider\\secret-token-abc', code: 'auth secret-token-abc' },
  ];
  const proof = evaluateCouncilReleaseProof(v);
  assert.equal(proof.code, 'MEL_COUNCIL_02_INDEPENDENT_CRITIQUES_MISSING');
  assert.deepEqual(proof.summary.failed_provider_models, [
    { identity: 'workers-ai::@cf/google/gemma-4-26b-a4b-it', code: 'EMPTY_WORKERS_AI_RESPONSE' },
    { identity: 'workers-ai::@cf/nvidia/nemotron-3-120b-a12b', code: 'PROVIDER_FAILED' },
    { identity: 'MODEL_ID_REDACTED', code: 'PROVIDER_FAILURE_REDACTED' },
  ]);
  assert.deepEqual(proof.summary.successful_provider_models, ['workers-ai::@cf/meta/llama-3.3-70b-instruct-fp8-fast']);
  assert.doesNotMatch(JSON.stringify(proof), /secret-token-abc/);
});

test('two fabricated copies of the same provider-model cannot fake independence', () => {
  const v = valid();
  v.result.critiques = [crit('workers-ai', 'm1'), crit('workers-ai', 'm1')];
  assert.equal(evaluateCouncilReleaseProof(v).code, 'MEL_COUNCIL_02_UNIQUENESS_FAILED');
});
test('synthesis, provenance and zero-euro proof each remain hard gates', () => {
  const v = valid(); v.result.synthesis.text = '';
  assert.equal(evaluateCouncilReleaseProof(v).code, 'MEL_COUNCIL_02_SYNTHESIS_FAILED');
  const p = valid(); delete p.result.critiques[0].provenance.model;
  assert.equal(evaluateCouncilReleaseProof(p).code, 'MEL_COUNCIL_02_PROVENANCE_MISSING');
  const c = valid(); c.result.critiques[0].cost.allowed = false;
  assert.equal(evaluateCouncilReleaseProof(c).code, 'MEL_COUNCIL_02_ZERO_COST_PROOF_FAILED');
});
test('release still calls the strict verifier instead of accepting degraded Council', () => {
  const wf = readFileSync('.github/workflows/deploy-cloudflare-release.yml', 'utf8');
  assert.match(wf, /node scripts\/check-release-council-proof\.mjs production-mel-council-02\.json/);
  assert.match(wf, /MEL_RELEASE_DEEP_AI_PROOFS_PAUSED/);
});
