import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isVerifiedRuntimeWorkProof,
  distinctModelIdentitiesFromFanout,
} from '../src/evolution/autonomy-proof-identity.js';

const identities = [
  { provider: 'workers-ai', model: 'llama' },
  { provider: 'workers-ai', model: 'qwen' },
];
const validProof = () => ({
  status: 'VERIFIED',
  version: 3,
  target_job_id: 'job-1',
  recovered_interrupted_node: true,
  providers_attempted: 2,
  successful_candidates: 1,
  provider_model_identities: structuredClone(identities),
});

test('Work DAG proof requires two distinct actual model identities, not just two counters', () => {
  assert.equal(isVerifiedRuntimeWorkProof(validProof(), 'job-1'), true);
  const invalid = [
    { version: 2 },
    { provider_model_identities: [] },
    { provider_model_identities: [{...identities[0]}, {...identities[0]}] },
    { provider_model_identities: [{...identities[0]}, {provider:'workers-ai',model:'llama'}] },
    { provider_model_identities: [identities[0]] },
    { provider_model_identities: [identities[0], {provider:'',model:'qwen'}] },
    { providers_attempted: 3 },
    { successful_candidates: 3 },
    { target_job_id: 'job-2' },
  ];
  for (const changes of invalid) {
    assert.equal(isVerifiedRuntimeWorkProof({ ...validProof(), ...changes }, 'job-1'), false,
      JSON.stringify(changes));
  }
});

test('real fanout identity extraction rejects duplicated attempts and adapter aliases of the same model', () => {
  const base = {
    providersAttempted: ['adapter-a', 'adapter-b'],
    providerHealth: [
      { id: 'adapter-a', provider: 'workers-ai', model: 'llama' },
      { id: 'adapter-b', provider: 'workers-ai', model: 'qwen' },
    ],
  };
  assert.deepEqual(distinctModelIdentitiesFromFanout(base), identities);
  const invalid = [
    { ...base, providersAttempted: ['adapter-a', 'adapter-a'] },
    { ...base, providerHealth: [
      base.providerHealth[0],
      { id: 'adapter-b', provider: 'workers-ai', model: 'llama' },
    ] },
    { ...base, providerHealth: [base.providerHealth[0]] },
    { ...base, providerHealth: [base.providerHealth[0], base.providerHealth[0], base.providerHealth[1]] },
    { ...base, providerHealth: [{...base.providerHealth[0], model:''}, base.providerHealth[1]] },
  ];
  for (const result of invalid) {
    assert.throws(() => distinctModelIdentitiesFromFanout(result),
      error => error.code === 'RUNTIME_WORK_DAG_MULTI_AI_NOT_PROVEN');
  }
});
