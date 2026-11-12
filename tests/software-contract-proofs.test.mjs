import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { SOFTWARE_CONTRACT_PROOFS } from '../src/roadmap/software-contract-proofs.js';
import { ROADMAP_PROOF_SOURCES, classifyRoadmapItem } from '../src/roadmap/roadmap-truth.js';

test('the five software proofs run without a model and can become live journal evidence', async () => {
  const calls = [];
  const bus = createDefaultCapabilityBus({
    env: {},
    audit: async event => { if (event.status === 'SUCCEEDED') calls.push(event.capability); },
  });
  for (const proof of SOFTWARE_CONTRACT_PROOFS) {
    const output = await bus.execute(proof.id, {}, { owner: 'test' });
    assert.equal(output.ok, true, proof.id);
    assert.deepEqual(ROADMAP_PROOF_SOURCES[proof.roadmapId], { capabilities: [proof.id] });
  }
  assert.equal(calls.length, SOFTWARE_CONTRACT_PROOFS.length);
  const evidence = {
    capabilities: new Map(SOFTWARE_CONTRACT_PROOFS.map(proof => [proof.id, { ok: 1, ko: 0, last_ok: Date.now(), last_ko: null, error: null }])),
    computer: new Map(),
    delivered: new Map(),
  };
  for (const proof of SOFTWARE_CONTRACT_PROOFS) {
    assert.equal(classifyRoadmapItem(proof.roadmapId, evidence).truth, 'VERIFIED_LIVE', proof.roadmapId);
  }
});
