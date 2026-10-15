import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessLoraPreviewVersion } from '../scripts/check-lora-preview-version.mjs';

const sha = '1995d5f3de7198b8890ca488922910991febc006';
const proof = () => ({
  ok:true, capability:'code.read',
  result:{
    exact_deployment_identity_known:true,
    deployed_branch:'reconcile/mel-candidate-20261014',
    deployed_sha:sha,
    content:'private code must not be logged',
  },
});

test('LoRA collector only accepts the exact deployed preview SHA', () => {
  const result = assessLoraPreviewVersion(proof(), sha);
  assert.equal(result.ok,true);
  assert.equal(result.code,'LORA_PREVIEW_EXACT_SHA_VERIFIED');
  assert.doesNotMatch(JSON.stringify(result), /private code/);
});

test('stale SHA, missing identity and wrong environment are rejected', () => {
  let v=proof();v.result.deployed_sha='a'.repeat(40);
  assert.equal(assessLoraPreviewVersion(v,sha).code,'LORA_PREVIEW_SHA_MISMATCH');
  v=proof();v.result.deployed_branch='main';
  assert.equal(assessLoraPreviewVersion(v,sha).code,'LORA_PREVIEW_IDENTITY_UNVERIFIED');
  v=proof();v.result.exact_deployment_identity_known=false;
  assert.equal(assessLoraPreviewVersion(v,sha).code,'LORA_PREVIEW_IDENTITY_UNVERIFIED');
  v=proof();v.capability='echo';
  assert.equal(assessLoraPreviewVersion(v,sha).code,'LORA_PREVIEW_CODE_PROOF_MISSING');
  assert.equal(assessLoraPreviewVersion(proof(),'bad-sha').code,'LORA_PREVIEW_EXPECTED_SHA_INVALID');
});

test('authenticated SHA preflight is required after auth and before all LoRA inference', () => {
  const source=readFileSync('.github/workflows/lora-kaggle-free-collect.yml','utf8');
  const auth=source.indexOf('      - name: Wait for preview auth propagation');
  const guard=source.indexOf('      - name: Wait for isolated preview exact collector SHA');
  const benchmark=source.indexOf('      - name: Benchmark exact Kaggle adapter');
  assert.ok(auth>=0 && guard>auth && benchmark>guard);
  const part=source.slice(guard,benchmark);
  assert.match(part,/PREVIEW_EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(part,/--data '\{"id":"code\.read","input":\{"path":"src\/router\.js"\}\}'/);
  assert.match(part,/node scripts\/check-lora-preview-version\.mjs \/tmp\/mel-lora-preview-version\.json "\$PREVIEW_EXPECTED_SHA"/);
  assert.match(part,/LORA_PREVIEW_EXACT_SHA_TIMEOUT/);
  assert.doesNotMatch(part,/--data.*\bmodel\.council\b|--data.*\blora\/benchmark\b/);
});
