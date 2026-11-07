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
  value.control = { private: 'PRIVATE_CONTROL' };
  value.manifest_01.business_indicators = [{ id: 'PRIVATE_INDICATOR', value: 'PRIVATE_VALUE', kind: 'REPORT_DATA' }];
  assert.equal(value.manifest_01.all_verified, false);
  assert.equal(validManifestReport(value), true);
  const calls = [];
  const results = await runLiveChecks({ MEL_DEPLOYED_GIT_SHA: 'a'.repeat(40) }, requiredLiveChecks(goal, ''), {
    createRuntime: async () => ({ bus: { execute: async (id, input) => {
      calls.push({ id, input });
      return value;
    } } }),
  });
  assert.deepEqual(calls, [{ id: 'autonomy.status', input: {} }]);
  assert.equal(liveProofGate(['autonomy.status'], results, { goal }).ok, true);
  assert.equal(results[0].functional_evidence.priorities.length, 5);
  assert.equal(JSON.stringify(results).includes('PRIVATE_'), false);
  assert.equal(JSON.stringify(results).includes('control'), false);
});

test('manifest recipe is bound to its exact objective rather than appended roadmap mentions', () => {
  assert.deepEqual(requiredLiveChecks(goal + ' Gmail Agenda Drive report data', ''), ['autonomy.status']);
  assert.equal(hasObjectiveBoundVerificationChecks(goal, 'LIVE_CHECKS: autonomy.status'), true);
  assert.equal(hasObjectiveBoundVerificationChecks(goal, 'LIVE_CHECKS: gmail.messages.search'), false);
  assert.equal(hasObjectiveBoundVerificationChecks('[MEL-FOUNDER-02] runtime | MEL-MANIFEST-01', 'LIVE_CHECKS: autonomy.status'), false);
  assert.equal(hasObjectiveBoundVerificationChecks('[MEL-FOUNDER-02] persistance puis Gmail', 'LIVE_CHECKS: gmail.messages.search'), false, 'generic read cannot replace an objective recipe');
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

test('real readiness report consumes accepted software receipts rather than stale declared progress', async () => {
  const { D1DevJobRepository } = await import('../src/dev/d1-dev-job-repository.js');
  const { getAutonomyReadiness } = await import('../src/evolution/autonomy-readiness.js');
  const { createRoadmapCodeAcceptance } = await import('../src/roadmap/roadmap-code-acceptance.js');
  const { ROADMAP_CODE_CONTRACTS, roadmapContractRevision } = await import('../src/roadmap/roadmap-code-contracts.js');
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const id = 'MEL-FOUNDER-02', contract = ROADMAP_CODE_CONTRACTS[id], sha = 'b'.repeat(40);
  const branch = 'candidate/mel-clean-autonomy';
  let job = await repository.create({ id: 'founder-proof', requested_by: 'mel-autonomy', goal: '[MEL-FOUNDER-02]',
    optional_context: { roadmap_id: id, roadmap_contract_revision: roadmapContractRevision(id) } });
  job = await repository.update(job.id, { files_json: [...contract.code_paths, ...contract.test_paths].map(path => ({ path, content: 'fixture only' })) });
  const ci = { verified: true, workflow: 'full-candidate-ci', conclusion: 'success', head_sha: sha, head_branch: branch, run_id: 123 };
  const completion = { status: 'VERIFIED', candidate_sha: sha, candidate_branch: branch, ci_run_id: 123, ci,
    mel_implementation: { verified: true, providers_attempted: 2 } };
  const acceptance = createRoadmapCodeAcceptance(job, completion, ci);
  await repository.update(job.id, { status: 'COMPLETED', result_json: { autonomy_completion: completion, roadmap_code_acceptance: acceptance } });
  let report = (await getAutonomyReadiness({ repository })).manifest_01;
  assert.equal(report.priorities.find(row => row.roadmap_id === id).verified, true);
  assert.equal(report.priorities[4].verified, false, 'software delivery never certifies physical acceptance');
  assert.equal(validManifestReport({ schema: 'mel.autonomy-readiness', version: 3, manifest_01: report }), true);
  await repository.update(job.id, { result_json: { autonomy_completion: { ...completion, ci: { ...ci, verified: false } }, roadmap_code_acceptance: acceptance } });
  report = (await getAutonomyReadiness({ repository })).manifest_01;
  assert.equal(report.priorities.find(row => row.roadmap_id === id).verified, false, 'invalid CI cannot become report evidence');
});
