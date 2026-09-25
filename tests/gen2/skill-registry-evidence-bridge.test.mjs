import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MemorySkillRegistryStore,
  SkillRegistry,
} from '../../src/evolution/skill-registry.js';
import { SkillRegistryEvidenceBridge } from '../../src/evolution/skill-registry-evidence-bridge.js';

function candidatePipeline() {
  return {
    ok: true,
    status: 'CANDIDATE',
    module_id: 'fixture.module',
    candidate_ref: 'candidate/fixture-module',
    activation_allowed: false,
    release_gate_required: true,
    stages: [
      'AI_STATE_OF_PLAY',
      'INSPECTION',
      'PLAN_GATE',
      'SPEC',
      'GENERATE',
      'VALIDATE',
      'TEST',
      'SANDBOX',
      'SECURITY_REVIEW',
    ].map(stage => ({ stage, status: 'PASS' })),
  };
}

const releaseEvidence = {
  approved: true,
  approval_id: 'release-1',
  tests_passed: true,
  sandbox_passed: true,
  security_passed: true,
  artifact_digest: 'sha256:' + 'a'.repeat(64),
  source_sha: 'b'.repeat(40),
};

function activeAdapter() {
  return {
    plan_id: 'plan-1',
    finetune_id: 'ft-1',
    dataset_digest: 'fnv1a-12345678',
    approval: { approved: true, approval_id: 'adapter-release' },
    adapter: {
      id: 'adapter-1',
      digest: 'sha256:' + 'c'.repeat(64),
      finetune_id: 'ft-1',
    },
    benchmark: {
      baseline: { overall: 0.70 },
      candidate: { overall: 0.82 },
      decision: { promote: true, reason: 'measured gain' },
    },
  };
}

test('Module Lab candidate becomes a candidate skill but cannot activate', async () => {
  const registry = new SkillRegistry();
  const bridge = new SkillRegistryEvidenceBridge(registry);

  const record = await bridge.registerModuleCandidate({
    skillId: 'skill.fixture',
    name: 'Fixture skill',
    version: '1.0.0-candidate.1',
    capabilities: ['fixture.run'],
    pipeline: candidatePipeline(),
  });

  assert.equal(record.state, 'candidate');
  assert.equal(record.metadata.release_gate_required, true);
  assert.ok(record.evidence.some(row => row.id === 'module-lab:security_review' && row.status === 'pass'));
  assert.throws(
    () => registry.activate('skill.fixture', '1.0.0-candidate.1'),
    /SKILL_REGISTRY_VERSION_NOT_VERIFIED/,
  );
});

test('verified release requires independent proof and a distinct immutable version', async () => {
  const registry = new SkillRegistry();
  const bridge = new SkillRegistryEvidenceBridge(registry);

  await bridge.registerModuleCandidate({
    skillId: 'skill.fixture',
    name: 'Fixture skill',
    version: '1.0.0-candidate.1',
    capabilities: ['fixture.run'],
    pipeline: candidatePipeline(),
  });

  await assert.rejects(
    () => bridge.verifyModuleRelease({
      skillId: 'skill.fixture',
      candidateVersion: '1.0.0-candidate.1',
      verifiedVersion: '1.0.0',
      releaseEvidence: { ...releaseEvidence, approved: false },
    }),
    /SKILL_BRIDGE_RELEASE_APPROVAL_REQUIRED/,
  );

  await assert.rejects(
    () => bridge.verifyModuleRelease({
      skillId: 'skill.fixture',
      candidateVersion: '1.0.0-candidate.1',
      verifiedVersion: '1.0.0-candidate.1',
      releaseEvidence,
    }),
    /SKILL_BRIDGE_VERIFIED_VERSION_MUST_DIFFER/,
  );

  const result = await bridge.verifyModuleRelease({
    skillId: 'skill.fixture',
    candidateVersion: '1.0.0-candidate.1',
    verifiedVersion: '1.0.0',
    releaseEvidence,
  });

  assert.equal(result.record.state, 'verified');
  assert.equal(result.activation.active, '1.0.0');
  assert.equal(registry.resolve('skill.fixture').version, '1.0.0');
  assert.equal(registry.history('skill.fixture').length, 2);
});

test('LearningEngine adapter can enter the registry only with real activation evidence', async () => {
  const registry = new SkillRegistry();
  const bridge = new SkillRegistryEvidenceBridge(registry);

  await assert.rejects(
    () => bridge.registerLearningAdapter({
      skillId: 'skill.learned-model',
      name: 'Learned model',
      version: 'adapter-1',
      capabilities: ['model.inference'],
      activeAdapter: {
        ...activeAdapter(),
        approval: { approved: false },
      },
    }),
    /SKILL_BRIDGE_ADAPTER_APPROVAL_REQUIRED/,
  );

  const result = await bridge.registerLearningAdapter({
    skillId: 'skill.learned-model',
    name: 'Learned model',
    version: 'adapter-1',
    capabilities: ['model.inference'],
    activeAdapter: activeAdapter(),
  });

  assert.equal(result.record.state, 'verified');
  assert.equal(result.activation.active, 'adapter-1');
  assert.equal(result.record.metadata.adapter_id, 'adapter-1');
  assert.ok(result.record.evidence.some(row => row.id === 'learning-engine:benchmark' && row.status === 'pass'));
});

test('syncLearningEngine is truthful when there is no active adapter', async () => {
  const registry = new SkillRegistry();
  const bridge = new SkillRegistryEvidenceBridge(registry);

  const result = await bridge.syncLearningEngine({
    learningEngine: { activeAdapter: async () => null },
    skillId: 'skill.none',
    name: 'No adapter',
    version: 'none',
    capabilities: ['model.inference'],
  });

  assert.deepEqual(result, { synced: false, reason: 'NO_ACTIVE_ADAPTER' });
  assert.equal(registry.list().length, 0);
});

test('bridge can persist the verified registry through its configured store', async () => {
  const store = new MemorySkillRegistryStore();
  const registry = new SkillRegistry({ store });
  const bridge = new SkillRegistryEvidenceBridge(registry);

  await bridge.registerLearningAdapter({
    skillId: 'skill.persisted',
    name: 'Persisted learned skill',
    version: 'adapter-1',
    capabilities: ['model.inference'],
    activeAdapter: activeAdapter(),
    persist: true,
  });

  const restored = await SkillRegistry.restore(store);
  assert.equal(restored.resolve('skill.persisted').version, 'adapter-1');
});
