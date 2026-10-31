import test from 'node:test';
import assert from 'node:assert/strict';
import * as watch from '../src/evaluation/capability-watch-runtime.js';

// Regression seed for MEL-MANIFEST-07: the contract's code must be loaded by
// its own test; MAX extends this file with the behavior it delivers.
test('capability watch runtime exposes its runtime entry points', () => {
  for (const name of ['runEcosystemCapabilityWatch', 'getEcosystemCapabilityWatchStatus', 'reconcileDiscoveryJobs', 'applyEcosystemProposalDecision'])
    assert.equal(typeof watch[name], 'function', name);
});
