import test from 'node:test';
import assert from 'node:assert/strict';
import * as watch from '../src/evaluation/capability-watch-runtime.js';

// Regression seed for MEL-MANIFEST-07: the contract's code must be loaded by
// its own test; MAX extends this file with the behavior it delivers.
test('capability watch runtime exposes its runtime entry points', () => {
  for (const name of ['runEcosystemCapabilityWatch', 'getEcosystemCapabilityWatchStatus', 'reconcileDiscoveryJobs', 'applyEcosystemProposalDecision'])
    assert.equal(typeof watch[name], 'function', name);
});
test('two concurrent admissions of the same discovery create one job and the watch stays passive while a roadmap mission is available', async () => {
  const { admitDiscoveryCandidate, discoveryHandoffAllowed } = watch;
  let enqueued = 0;
  const queue = async (_env, candidate) => {
    enqueued += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { fingerprint: candidate.fingerprint, job_id: 'job-' + enqueued, created: true };
  };
  const candidate = { fingerprint: 'fp-1', action: 'NEW' };
  const [a, b] = await Promise.all([
    admitDiscoveryCandidate({}, candidate, {}, queue),
    admitDiscoveryCandidate({}, candidate, {}, queue),
  ]);
  assert.equal(enqueued, 1);
  assert.equal(a.job_id, b.job_id);
  await admitDiscoveryCandidate({}, { fingerprint: 'fp-2' }, {}, queue);
  assert.equal(enqueued, 2, 'another discovery is admitted normally');
  assert.equal(discoveryHandoffAllowed({ roadmapMissionAvailable: true }), false);
  assert.equal(discoveryHandoffAllowed({ roadmapMissionAvailable: false }), true);
  assert.equal(discoveryHandoffAllowed({ allowHandoff: false }), false);
});
