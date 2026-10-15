import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessLoraBenchmarkReadiness } from '../scripts/validate-lora-benchmark-readiness.mjs';

const good = () => ({
  baseline: 0.48, candidate: 0.79,
  baseline_case_errors: [], candidate_case_errors: [],
  canonical_gate_passed: true, impact_gate_passed: true,
  activation_requested: false, activated: false,
});

test('passing benchmark without activation is valid but is not claimed active', () => {
  const v = assessLoraBenchmarkReadiness(good());
  assert.equal(v.ok, true);
  assert.equal(v.code, 'LORA_BENCHMARK_PASSED_NOT_ACTIVATED');
});
test('case errors reject a benchmark regardless of successful transport', () => {
  const v = good(); v.candidate_case_errors = [{ id: 'case-1', error: '8008: Internal server error' }];
  const result = assessLoraBenchmarkReadiness(v);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LORA_BENCHMARK_CASE_ERRORS');
  assert.deepEqual(result.case_error_counts, { baseline: 0, candidate: 1 });
  assert.doesNotMatch(JSON.stringify(result), /Internal server error/);
});
test('real failed candidate measurements are rejected', () => {
  const v = good(); v.baseline = 0.4743589743589743; v.candidate = 0.17948717948717946;
  v.canonical_gate_passed = false; v.impact_gate_passed = false;
  assert.equal(assessLoraBenchmarkReadiness(v).ok, false);
});
test('baseline errors prevent a reliable comparison', () => {
  const v = good(); v.baseline_case_errors = [{ id: 'case-2', error: 'empty_benchmark_response' }];
  assert.equal(assessLoraBenchmarkReadiness(v).code, 'LORA_BENCHMARK_CASE_ERRORS');
});
test('an activation request without activation is not verified', () => {
  const v = good(); v.activation_requested = true;
  assert.equal(assessLoraBenchmarkReadiness(v).code, 'LORA_ACTIVATION_NOT_VERIFIED');
});
test('unrequested activation is rejected', () => {
  const v = good(); v.activated = true;
  assert.equal(assessLoraBenchmarkReadiness(v).code, 'LORA_UNREQUESTED_ACTIVATION');
});
test('invalid or incomplete evidence fails closed', () => {
  assert.equal(assessLoraBenchmarkReadiness(null).ok, false);
  const v = good(); delete v.candidate_case_errors;
  assert.equal(assessLoraBenchmarkReadiness(v).code, 'LORA_BENCHMARK_EVIDENCE_INCOMPLETE');
});
test('collector gates model readiness while retaining artifacts on failure', () => {
  const workflow = readFileSync('.github/workflows/lora-kaggle-free-collect.yml', 'utf8');
  assert.match(workflow, /- name: Validate LoRA benchmark readiness/);
  assert.match(workflow, /node scripts\/validate-lora-benchmark-readiness\.mjs artifacts\/finalize-result\.json/);
  assert.match(workflow, /- name: Upload Kaggle training evidence\n\s+if: always\(\)/);
});
