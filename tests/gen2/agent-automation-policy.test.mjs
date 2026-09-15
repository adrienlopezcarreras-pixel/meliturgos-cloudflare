import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSION_TIERS,
  RUN_STATUSES,
  authorizeRunRequest,
  automationExecutionPolicy,
  createAgentAutomationPolicy,
  createInMemoryAgentAutomationPolicyAdapter,
  listRunsRequest,
} from '../../src/automations/agent-automation-policy.js';

const policy = (overrides = {}) => ({
  automation_id: 'daily-drive-audit',
  agent_id: 'mel-work-agent',
  required_capabilities: ['drive.read', 'files.search'],
  permission_tier: PERMISSION_TIERS.READ,
  enabled: true,
  metadata: { project: 'mel' },
  ...overrides,
});

const request = (overrides = {}) => ({
  policy: policy(),
  run_id: 'run-1',
  idempotency_key: 'daily-drive-audit:2026-09-15',
  owner: 'adrien',
  granted_capabilities: ['drive.read', 'files.search'],
  granted_tier: PERMISSION_TIERS.READ,
  requested_at: 1_000,
  ...overrides,
});

test('policy and run requests are canonical and defensive', () => {
  const raw = policy({
    automation_id: ' daily-drive-audit ',
    agent_id: ' mel-work-agent ',
    required_capabilities: [' files.search ', 'drive.read'],
  });
  const normalized = automationExecutionPolicy(raw);
  assert.equal(normalized.automation_id, 'daily-drive-audit');
  assert.equal(normalized.agent_id, 'mel-work-agent');
  assert.deepEqual(normalized.required_capabilities, ['drive.read', 'files.search']);
  assert.notEqual(normalized.metadata, raw.metadata);

  raw.metadata.project = 'mutated';
  assert.equal(normalized.metadata.project, 'mel');

  assert.deepEqual(authorizeRunRequest({
    run_id: ' run ',
    idempotency_key: ' idem ',
    owner: ' owner ',
    granted_capabilities: ['x.y'],
    granted_tier: PERMISSION_TIERS.SAFE_WRITE,
    requested_at: 10,
  }), {
    run_id: 'run',
    idempotency_key: 'idem',
    owner: 'owner',
    granted_capabilities: ['x.y'],
    granted_tier: PERMISSION_TIERS.SAFE_WRITE,
    requested_at: 10,
    approved: false,
  });

  assert.throws(() => automationExecutionPolicy(policy({ permission_tier: 'ROOT' })), { code: 'AUTOMATION_PERMISSION_TIER_INVALID' });
  assert.throws(() => automationExecutionPolicy(policy({ required_capabilities: [] })), { code: 'AUTOMATION_REQUIRED_CAPABILITIES_INVALID' });
});

test('agent automation policy port fails closed without an adapter', async () => {
  const service = createAgentAutomationPolicy();
  await assert.rejects(() => service.authorizeRun(request()), { code: 'NOT_IMPLEMENTED:agent_automation_policy.authorizeRun' });
});

test('authorization requires every declared capability', async () => {
  const service = createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());

  await assert.rejects(
    () => service.authorizeRun(request({ granted_capabilities: ['drive.read'] })),
    { code: 'AUTOMATION_CAPABILITY_DENIED', status: 403 },
  );
  assert.equal((await service.listRuns()).length, 0);
});

test('permission tiers are monotonic and fail closed', async () => {
  const service = createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());
  const sensitive = request({
    policy: policy({ permission_tier: PERMISSION_TIERS.SENSITIVE }),
    granted_tier: PERMISSION_TIERS.SAFE_WRITE,
  });

  await assert.rejects(
    () => service.authorizeRun(sensitive),
    { code: 'AUTOMATION_PERMISSION_TIER_DENIED', status: 403 },
  );

  const authorized = await service.authorizeRun({
    ...sensitive,
    run_id: 'run-2',
    idempotency_key: 'idem-2',
    granted_tier: PERMISSION_TIERS.DESTRUCTIVE,
  });
  assert.equal(authorized.claim.status, RUN_STATUSES.AUTHORIZED);
  assert.equal(authorized.claim.permission_tier, PERMISSION_TIERS.SENSITIVE);
});

test('destructive automations require an explicit approval even with sufficient grants', async () => {
  const service = createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());
  const destructive = request({
    policy: policy({
      automation_id: 'delete-generated-cache',
      permission_tier: PERMISSION_TIERS.DESTRUCTIVE,
      required_capabilities: ['files.delete'],
    }),
    granted_capabilities: ['files.delete'],
    granted_tier: PERMISSION_TIERS.DESTRUCTIVE,
  });

  await assert.rejects(
    () => service.authorizeRun(destructive),
    { code: 'AUTOMATION_EXPLICIT_APPROVAL_REQUIRED', status: 403 },
  );

  const accepted = await service.authorizeRun({ ...destructive, approved: true });
  assert.equal(accepted.claim.status, RUN_STATUSES.AUTHORIZED);
});

test('disabled automations cannot create execution claims', async () => {
  const service = createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());
  await assert.rejects(
    () => service.authorizeRun(request({ policy: policy({ enabled: false }) })),
    { code: 'AUTOMATION_DISABLED', status: 409 },
  );
});

test('idempotency deduplicates the same run and rejects key reuse for another run', async () => {
  const service = createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());
  const first = await service.authorizeRun(request());
  const replay = await service.authorizeRun(request());
  assert.equal(first.deduplicated, false);
  assert.equal(replay.deduplicated, true);
  assert.deepEqual(replay.claim, first.claim);

  await assert.rejects(
    () => service.authorizeRun(request({ run_id: 'run-other' })),
    { code: 'AUTOMATION_IDEMPOTENCY_CONFLICT', status: 409 },
  );
  assert.equal((await service.listRuns()).length, 1);
});

test('run completion and failure histories are bounded domain states', async () => {
  const service = createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());
  await service.authorizeRun(request());
  const completed = await service.completeRun({ run_id: 'run-1', completed_at: 1_100, result: { artifact_id: 'a1' } });
  assert.equal(completed.status, RUN_STATUSES.COMPLETED);
  assert.equal(completed.result.artifact_id, 'a1');

  const replay = await service.completeRun({ run_id: 'run-1', completed_at: 1_200 });
  assert.equal(replay.completed_at, 1_100);

  await assert.rejects(
    () => service.failRun({ run_id: 'run-1', failed_at: 1_300, error_code: 'LATE_FAILURE' }),
    { code: 'AUTOMATION_RUN_NOT_ACTIVE', status: 409 },
  );

  await service.authorizeRun(request({ run_id: 'run-2', idempotency_key: 'idem-2' }));
  const failed = await service.failRun({ run_id: 'run-2', failed_at: 1_250, error_code: 'CAPABILITY_TIMEOUT' });
  assert.equal(failed.status, RUN_STATUSES.FAILED);
  assert.equal(failed.error_code, 'CAPABILITY_TIMEOUT');
  assert.equal((await service.listRuns({ status: RUN_STATUSES.FAILED })).length, 1);
});

test('read models are filterable and defensive; unsafe query ranges are rejected', async () => {
  const service = createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());
  await service.authorizeRun(request());

  const rows = await service.listRuns({ automation_id: 'daily-drive-audit' });
  assert.equal(rows.length, 1);
  rows[0].required_capabilities.push('outside.mutation');
  assert.deepEqual(
    (await service.getRun({ run_id: 'run-1' })).required_capabilities,
    ['drive.read', 'files.search'],
  );

  assert.deepEqual(listRunsRequest({ limit: 3 }), { limit: 3 });
  assert.throws(() => listRunsRequest({ status: 'RUNNING' }), { code: 'AUTOMATION_RUN_STATUS_INVALID' });
  assert.throws(() => listRunsRequest({ limit: 0 }), { code: 'AUTOMATION_RUN_LIMIT_INVALID' });
});
