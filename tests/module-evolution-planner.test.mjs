import test from 'node:test';
import assert from 'node:assert/strict';
import { planModuleEvolution } from '../src/evolution/module-evolution-planner.js';

function authorizedPreflight() {
  return {
    stage: 'AI_STATE_OF_PLAY_COMPLETE',
    code_inspection_allowed: true,
    council: { status: 'READY', degraded: false },
  };
}

function completeInspection() {
  return {
    status: 'COMPLETE',
    evidence: [{ path: 'src/evolution/capability-gap-detector.js', kind: 'existing-code' }],
  };
}

test('reuses a healthy existing capability without invoking Module Lab', async () => {
  let calls = 0;
  const result = await planModuleEvolution({
    goal: 'recherche web',
    threshold: 1,
    capabilities: [{ id: 'web.research', name: 'Recherche web', category: 'research', health: 'HEALTHY' }],
    moduleLab: { proposeModule: async () => { calls += 1; } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.stage, 'REUSE_EXISTING_CAPABILITY');
  assert.equal(calls, 0);
});

test('does not invoke Module Lab when the development gate is incomplete', async () => {
  let calls = 0;
  const result = await planModuleEvolution({
    goal: 'quantum hive hologram controller',
    capabilities: [],
    moduleLab: { proposeModule: async () => { calls += 1; } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'DEVELOPMENT_NOT_AUTHORIZED');
  assert.equal(result.reason, 'AI_PREFLIGHT_REQUIRED');
  assert.equal(calls, 0);
});

test('sends an authorized real gap to Module Lab as a proposal only', async () => {
  let seen;
  const result = await planModuleEvolution({
    goal: 'quantum hive hologram controller',
    capabilities: [],
    preflight: authorizedPreflight(),
    inspection: completeInspection(),
    context: { source: 'chat' },
    moduleLab: {
      proposeModule: async spec => {
        seen = spec;
        return { id: 'proposal-1', status: 'PROPOSED' };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.stage, 'MODULE_PROPOSAL_READY');
  assert.equal(seen.kind, 'MODULE_EVOLUTION_REQUEST');
  assert.equal(seen.constraints.commit_allowed, false);
  assert.equal(seen.constraints.deployment_allowed, false);
  assert.equal(seen.constraints.runtime_mutation_allowed, false);
  assert.deepEqual(result.result, { id: 'proposal-1', status: 'PROPOSED' });
});

test('generation requires an explicit approval flag', async () => {
  let calls = 0;
  const result = await planModuleEvolution({
    goal: 'quantum hive hologram controller',
    capabilities: [],
    preflight: authorizedPreflight(),
    inspection: completeInspection(),
    mode: 'generate',
    moduleLab: { generateModule: async () => { calls += 1; } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'GENERATION_APPROVAL_REQUIRED');
  assert.equal(calls, 0);
});

test('explicitly approved generation is delegated without commit or deploy authority', async () => {
  let seen;
  const result = await planModuleEvolution({
    goal: 'quantum hive hologram controller',
    capabilities: [],
    preflight: authorizedPreflight(),
    inspection: completeInspection(),
    mode: 'generate',
    allowGeneration: true,
    moduleLab: {
      generateModule: async spec => {
        seen = spec;
        return { artifact: 'candidate-module.js' };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.stage, 'MODULE_GENERATION_READY');
  assert.equal(seen.constraints.candidate_only, true);
  assert.equal(seen.constraints.commit_allowed, false);
  assert.equal(seen.constraints.deployment_allowed, false);
});

test('contains Module Lab failures and returns a side-effect-free diagnostic', async () => {
  const result = await planModuleEvolution({
    goal: 'quantum hive hologram controller',
    capabilities: [],
    preflight: authorizedPreflight(),
    inspection: completeInspection(),
    moduleLab: {
      proposeModule: async () => { throw Object.assign(new Error('LAB_OFFLINE'), { code: 'LAB_OFFLINE' }); },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'MODULE_LAB_FAILED');
  assert.equal(result.reason, 'LAB_OFFLINE');
  assert.equal(result.next, 'INSPECT_MODULE_LAB_FAILURE_WITHOUT_SIDE_EFFECTS');
});
