import test from 'node:test';
import assert from 'node:assert/strict';
import { manifest01FoundationPrerequisites } from '../src/roadmap/manifest-01-acceptance.js';
import { validManifestReport, requiredLiveChecks, hasObjectiveBoundVerificationChecks, runLiveChecks, liveProofGate } from '../src/evolution/verify-existing-live-checks.js';

function readiness() {
  return { schema: 'mel.autonomy-readiness', version: 3,
    manifest_01: manifest01FoundationPrerequisites() };
}
const goal = '[MEL-MANIFEST-01] Tenir le compte des cinq priorités';

test('manifest verification proves an honest pending report without certifying its priorities', async () => {
  const value = readiness();
  assert.equal(value.manifest_01.all_verified, false);
  assert.equal(validManifestReport(value), true);
  const calls = [];
  const results = await runLiveChecks({}, requiredLiveChecks(goal, ''), {
    createRuntime: async () => ({ bus: { execute: async (id, input) => {
      calls.push({ id, input });
      return value;
    } } }),
  });
  assert.deepEqual(calls, [{ id: 'autonomy.status', input: {} }]);
  assert.equal(liveProofGate(['autonomy.status'], results, { goal }).ok, true);
  assert.equal(JSON.stringify(results).includes('priorities'), false);
  assert.equal(JSON.stringify(results).includes('control'), false);
});

test('manifest recipe is bound to its exact objective rather than appended roadmap mentions', () => {
  assert.deepEqual(requiredLiveChecks(goal + ' Gmail Agenda Drive report data', ''), ['autonomy.status']);
  assert.equal(hasObjectiveBoundVerificationChecks(goal, 'LIVE_CHECKS: autonomy.status'), true);
  assert.equal(hasObjectiveBoundVerificationChecks(goal, 'LIVE_CHECKS: gmail.messages.search'), false);
  assert.equal(hasObjectiveBoundVerificationChecks('[MEL-FOUNDER-02] runtime | MEL-MANIFEST-01', 'LIVE_CHECKS: autonomy.status'), false);
});

test('manifest rejects absent, inconsistent and falsely verified physical reports', () => {
  assert.equal(validManifestReport({}), false);
  for (const mutate of [
    r => { r.verified_count = 5; },
    r => { r.pending = []; },
    r => { r.priorities[4].verified = true; },
    r => { r.priorities[1].roadmap_id = 'MEL-FOUNDER-01'; },
    r => { r.ready = !r.ready; },
    r => { r.business_indicators = [{ kind: 'PRIORITY' }]; },
  ]) {
    const value = readiness(); mutate(value.manifest_01);
    assert.equal(validManifestReport(value), false);
  }
});

test('failed live accounting cannot pass with successful CI or arbitrary output', async () => {
  const results = await runLiveChecks({}, ['autonomy.status'], {
    createRuntime: async () => ({ bus: { execute: async () => ({ ok: true, ci: 'green' }) } }),
  });
  assert.equal(liveProofGate(['autonomy.status'], results, { goal }).ok, false);
});
