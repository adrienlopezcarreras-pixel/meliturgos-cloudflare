import test from 'node:test';
import assert from 'node:assert/strict';
import { observeLoraObjectives } from '../src/learning/lora-objective-observer.js';

const impact = (metrics, stage = 'AGENTIC_READY') => ({ kind: 'lora-impact-candidate', metadata: { next_stage: stage, candidate: metrics } });
const ok = { agentic_execution: 0.9, over_refusal_rate: 0.1, technical_depth: 0.9 };

test('before the uncensored gate the objective stays uncensored training', () => {
  assert.equal(observeLoraObjectives({ impactRows: [impact(ok, 'UNCENSORED_CONTINUE')] }).decision, 'TRAIN_UNCENSORED');
});

test('one weak measurement is noise; two in a row ask for an agentic cycle', () => {
  const weak = { ...ok, agentic_execution: 0.4 };
  assert.equal(observeLoraObjectives({ impactRows: [impact(ok), impact(weak)] }).decision, 'OBSERVE');
  const result = observeLoraObjectives({ impactRows: [impact(weak), impact(weak)] });
  assert.equal(result.decision, 'TRAIN_AGENTIC');
  assert.equal(result.reason, 'AGENTIC_EXECUTION_BELOW_OBJECTIVE');
});

test('an over-refusal regression reopens uncensored training first', () => {
  const regressed = { ...ok, over_refusal_rate: 0.5, agentic_execution: 0.4 };
  assert.equal(observeLoraObjectives({ impactRows: [impact(regressed), impact(regressed)] }).decision, 'TRAIN_UNCENSORED');
});

test('missions failing for pipeline reasons call for a code fix, not a LoRA', () => {
  const failed = { status: 'FAILED', result_json: { bridge_preparation_diagnostic: { mentor_failure_codes: [{ code: 'MENTOR_PROVIDER_TIMEOUT' }, { code: 'JOB_UPDATE_CONFLICT' }] } } };
  const result = observeLoraObjectives({ impactRows: [impact({ ...ok, agentic_execution: 0.4 }), impact({ ...ok, agentic_execution: 0.4 })], jobs: [failed, failed, failed, { status: 'COMPLETED' }] });
  assert.equal(result.decision, 'CODE_FIX');
  assert.equal(result.findings[0].code, 'LORA_GAP_IS_PIPELINE');
});


test('missing metrics never masquerade as persistent zero measurements', () => {
  const missing = { ...ok, agentic_execution: null, technical_depth: null };
  const result = observeLoraObjectives({ impactRows: [impact(missing), impact(missing)] });
  assert.equal(result.decision, 'OBSERVE');
  assert.equal(result.reason, 'OBJECTIVES_MET_OR_NOT_PERSISTENT');
});

test('missing over-refusal metric does not spuriously open an uncensored cycle', () => {
  const noRefusal = { ...ok, over_refusal_rate: undefined };
  const result = observeLoraObjectives({ impactRows: [impact(noRefusal), impact(noRefusal)] });
  assert.equal(result.decision, 'OBSERVE');
});
