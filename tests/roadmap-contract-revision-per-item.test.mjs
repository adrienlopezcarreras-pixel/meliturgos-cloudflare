import test from 'node:test';
import assert from 'node:assert/strict';
import { ROADMAP_CODE_CONTRACT_REVISION, roadmapContractRevision, assertRoadmapCodeChanges } from '../src/roadmap/roadmap-code-contracts.js';
import { ROADMAP_TECHNICAL_WORK } from '../src/roadmap/roadmap-dependencies.js';
import { roadmapCodeMissionContext } from '../src/evolution/roadmap-code-missions.js';

test('a reworded contract gets its own revision; the others keep the global one', () => {
  assert.notEqual(roadmapContractRevision('MEL-MANIFEST-08'), ROADMAP_CODE_CONTRACT_REVISION);
  assert.equal(roadmapContractRevision('MEL-FOUNDER-04'), ROADMAP_CODE_CONTRACT_REVISION);
  assert.equal(ROADMAP_TECHNICAL_WORK['MEL-MANIFEST-08'].contract_revision, roadmapContractRevision('MEL-MANIFEST-08'));
  const context = roadmapCodeMissionContext({ id: 'MEL-MANIFEST-08', ...ROADMAP_TECHNICAL_WORK['MEL-MANIFEST-08'] });
  assert.equal(context.roadmap_contract_revision, roadmapContractRevision('MEL-MANIFEST-08'));
});

test('a job planned under the old revision of a reworded contract is stale', () => {
  const job = { requested_by: 'mel-autonomy', optional_context: { roadmap_id: 'MEL-MANIFEST-08', roadmap_contract_revision: ROADMAP_CODE_CONTRACT_REVISION } };
  assert.throws(() => assertRoadmapCodeChanges(job, [{ path: 'src/capabilities/google-workspace-capabilities.js' }]), /ROADMAP_CODE_CONTRACT_STALE/);
});

test('a contract that forbids VERIFY_EXISTING marks its goal and the planner refuses a no-code plan', async () => {
  const { roadmapCodeMissionGoal } = await import('../src/evolution/roadmap-code-missions.js');
  const { requireProvableImplementationDecision } = await import('../src/evolution/autonomy-implementation-planner.js');
  const goal = roadmapCodeMissionGoal({ id: 'MEL-MANIFEST-08', ...ROADMAP_TECHNICAL_WORK['MEL-MANIFEST-08'] });
  assert.match(goal, /VERIFY_EXISTING_INTERDIT/);
  assert.doesNotMatch(roadmapCodeMissionGoal({ id: 'MEL-MANIFEST-05', ...ROADMAP_TECHNICAL_WORK['MEL-MANIFEST-05'] }), /VERIFY_EXISTING_INTERDIT/);
  assert.throws(() => requireProvableImplementationDecision(goal, 'DECISION: VERIFY_EXISTING\nPLAN: rien'), err => ['IMPLEMENTATION_UNPROVABLE_VERIFY_EXISTING', 'IMPLEMENTATION_QUALITY_CONTRACT_MISSING'].includes(err.code));
});

test('a contract with focus symbols puts them in the goal for the coder excerpt', async () => {
  const { roadmapCodeMissionGoal } = await import('../src/evolution/roadmap-code-missions.js');
  const goal = roadmapCodeMissionGoal({ id: 'MEL-FOUNDER-02', ...ROADMAP_TECHNICAL_WORK['MEL-FOUNDER-02'] });
  assert.match(goal, /FOCUS_CODE runAutonomyRuntimeTick autonomyTickAdvanced/);
});
