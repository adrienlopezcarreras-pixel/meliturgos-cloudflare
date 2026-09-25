import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { createAgentRegistry } from '../../src/agents/agent-registry.js';
import {
  createD1AgentRegistryAdapter,
  createInMemoryAgentRegistryAdapter,
} from '../../src/agents/d1-agent-registry.js';
import { createWorkAgentRuntime } from '../../src/agents/work-agent-runtime.js';
import { createAgentAutomationPolicy, PERMISSION_TIERS } from '../../src/automations/agent-automation-policy.js';
import { createD1AgentAutomationPolicyAdapter } from '../../src/automations/d1-agent-automation-policy.js';
import { createAgentAutomationRunnerAdapter } from '../../src/automations/agent-automation-runner.js';
import {
  getMultiAiLotReservation,
  releaseMultiAiLot,
  tryReserveMultiAiLot,
} from '../../src/coordination/multi-ai-lot-reservation.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function definition(id = 'mel.agent', version = '1.0.0') {
  return {
    id,
    version,
    name: 'MEL Agent',
    description: 'Bounded agent fixture',
    goal: 'execute the bounded plan',
    steps: [
      {
        id: 'echo',
        kind: 'TASK',
        idempotent: true,
        capability: 'echo',
        input: { value: 'agent-ok' },
      },
      {
        id: 'council',
        kind: 'AUGMENTIO',
        idempotent: true,
        depends_on: ['echo'],
        capability: 'council.state-of-play',
        input: { goal: 'review the bounded plan' },
      },
    ],
  };
}

function busFixture(calls = []) {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'echo',
    name: 'Echo',
    category: 'test',
    version: '1.0.0',
    provider: 'test',
    description: 'echo',
    input_schema: { type: 'object', additionalProperties: true },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async input => {
    calls.push({ capability: 'echo', input });
    return input;
  });
  bus.discover({
    id: 'council.state-of-play',
    name: 'Council',
    category: 'test',
    version: '1.0.0',
    provider: 'test',
    description: 'council',
    input_schema: { type: 'object', additionalProperties: true },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async input => {
    calls.push({ capability: 'council.state-of-play', input });
    return { status: 'COMPLETE', goal: input.goal };
  });
  return bus;
}

test('multi-AI lot reservation is atomic, owner-renewable and stale-owner safe', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());

  const first = await tryReserveMultiAiLot({
    db,
    item: 'GEN2-39',
    owner: 'page-a',
    sourceSha: 'a'.repeat(40),
    leaseMs: 60_000,
    now: 1_000,
  });
  assert.equal(first.acquired, true);

  const blocked = await tryReserveMultiAiLot({
    db,
    item: 'GEN2-39',
    owner: 'page-b',
    sourceSha: 'b'.repeat(40),
    leaseMs: 60_000,
    now: 2_000,
  });
  assert.equal(blocked.acquired, false);
  assert.equal(blocked.owner, 'page-a');

  const renewed = await tryReserveMultiAiLot({
    db,
    item: 'GEN2-39',
    owner: 'page-a',
    sourceSha: 'a'.repeat(40),
    leaseMs: 60_000,
    now: 3_000,
  });
  assert.equal(renewed.acquired, true);
  assert.equal((await getMultiAiLotReservation({ db, item: 'GEN2-39', now: 3_000 })).owner, 'page-a');
  assert.equal(await releaseMultiAiLot({ db, item: 'GEN2-39', owner: 'page-b' }), false);
  assert.equal(await releaseMultiAiLot({ db, item: 'GEN2-39', owner: 'page-a' }), true);
});

test('D1 agent registry persists a validated agent definition and can disable it', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const registry = createAgentRegistry(createD1AgentRegistryAdapter(db));

  const registered = await registry.register({ definition: definition() });
  assert.equal(registered.status, 'ACTIVE');
  assert.deepEqual(registered.required_capabilities, ['council.state-of-play', 'echo']);

  const second = createAgentRegistry(createD1AgentRegistryAdapter(db));
  assert.equal((await second.get({ agent_id: 'mel.agent' })).version, '1.0.0');
  assert.equal((await second.list()).length, 1);
  assert.equal((await second.disable({ agent_id: 'mel.agent' })).status, 'DISABLED');
});

test('agent registry rejects cyclic plans before they can enter Work Engine', async () => {
  const registry = createAgentRegistry(createInMemoryAgentRegistryAdapter());
  await assert.rejects(
    () => registry.register({
      definition: {
        id: 'cycle.agent',
        version: '1.0.0',
        steps: [
          { id: 'a', kind: 'TASK', capability: 'echo', depends_on: ['b'] },
          { id: 'b', kind: 'TASK', capability: 'echo', depends_on: ['a'] },
        ],
      },
    }),
    { code: 'WORK_DAG_CYCLE' },
  );
});

test('Work Agent runtime executes TASK + Council nodes through the same CapabilityBus and persists the DAG', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const calls = [];
  const bus = busFixture(calls);
  const registry = createAgentRegistry(createD1AgentRegistryAdapter(db));
  await registry.register({ definition: definition() });
  const runtime = createWorkAgentRuntime({ db, bus, registry, sourceSha: 'c'.repeat(40) });

  const result = await runtime.run({
    agent_id: 'mel.agent',
    run_id: 'agent-run-1',
    roadmap_item: 'GEN2-39',
    candidate_branch: 'candidate/mel-clean-autonomy',
    candidate_sha: 'c'.repeat(40),
  }, { owner: 'runtime', permissions: [], requestId: 'req-1' });

  assert.equal(result.summary.completed, true);
  assert.deepEqual(calls.map(row => row.capability), ['echo', 'council.state-of-play']);
  assert.equal(calls[1].input.context.agent_id, 'mel.agent');
  assert.equal((await runtime.getRun({ run_id: 'agent-run-1' })).summary.completed, true);
  const reservation = await getMultiAiLotReservation({ db, item: 'GEN2-39' });
  assert.equal(reservation.expired, true);
});

test('Work Agent runtime refuses a lot already held by another page before executing capabilities', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const calls = [];
  const bus = busFixture(calls);
  const registry = createAgentRegistry(createD1AgentRegistryAdapter(db));
  await registry.register({ definition: definition() });
  await tryReserveMultiAiLot({ db, item: 'GEN2-39', owner: 'other-page', now: Date.now() });

  const runtime = createWorkAgentRuntime({ db, bus, registry });
  await assert.rejects(
    () => runtime.run({
      agent_id: 'mel.agent',
      run_id: 'agent-run-blocked',
      roadmap_item: 'GEN2-39',
    }),
    { code: 'MULTI_AI_LOT_RESERVED', status: 409 },
  );
  assert.equal(calls.length, 0);
});

test('D1 automation authorization is durable and idempotent before agent execution', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const policy = createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));
  const input = {
    policy: {
      automation_id: 'auto-1',
      agent_id: 'mel.agent',
      required_capabilities: ['echo'],
      permission_tier: PERMISSION_TIERS.READ,
      metadata: { roadmap_item: 'GEN2-39' },
    },
    run_id: 'automation-run-1',
    idempotency_key: 'auto-1:tick-1',
    owner: 'owner',
    granted_capabilities: ['echo'],
    granted_tier: PERMISSION_TIERS.READ,
    requested_at: 1_000,
  };

  const first = await policy.authorizeRun(input);
  const replay = await policy.authorizeRun(input);
  assert.equal(first.deduplicated, false);
  assert.equal(replay.deduplicated, true);
  assert.equal(replay.claim.metadata.roadmap_item, 'GEN2-39');

  const second = createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));
  assert.equal((await second.getRun({ run_id: 'automation-run-1' })).status, 'AUTHORIZED');
});

test('agent automation runner executes one authorized Work DAG and deduplicates replay', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const calls = [];
  const bus = busFixture(calls);
  const registry = createAgentRegistry(createD1AgentRegistryAdapter(db));
  await registry.register({
    definition: {
      id: 'automation.agent',
      version: '1.0.0',
      steps: [{ id: 'echo', kind: 'TASK', idempotent: true, capability: 'echo', input: { value: 'auto' } }],
    },
  });
  const agentRuntime = createWorkAgentRuntime({ db, bus, registry });
  const policy = createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));
  const runner = createAgentAutomationRunnerAdapter({ policy, agentRuntime, now: () => 2_000 });

  const input = {
    policy: {
      automation_id: 'auto-agent',
      agent_id: 'automation.agent',
      required_capabilities: ['echo'],
      permission_tier: PERMISSION_TIERS.READ,
      metadata: {},
    },
    run_id: 'auto-run',
    idempotency_key: 'auto-run:once',
    owner: 'owner',
    granted_capabilities: ['echo'],
    granted_tier: PERMISSION_TIERS.READ,
    requested_at: 1_000,
  };

  const first = await runner.run(input, { owner: 'owner', permissions: [], requestId: 'auto' });
  assert.equal(first.claim.status, 'COMPLETED');
  assert.equal(first.executed, true);
  assert.equal(calls.length, 1);

  const replay = await runner.run(input, { owner: 'owner', permissions: [], requestId: 'auto' });
  assert.equal(replay.deduplicated, true);
  assert.equal(replay.executed, false);
  assert.equal(calls.length, 1);
});
