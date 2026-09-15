import test from 'node:test';
import assert from 'node:assert/strict';

import { RecoveryBundleBuilder } from '../../src/resilience/recovery-bundle.js';
import {
  RECOVERY_DRILL_SCHEMA,
  RECOVERY_DRILL_STATE,
  createRecoveryDrillController,
  evaluateRecoveryDrill,
  normalizeRecoveryDrill,
} from '../../src/resilience/recovery-drill.js';

async function fixture() {
  const builder = new RecoveryBundleBuilder({ now: () => '2026-09-15T18:00:00Z' });
  const bundle = await builder.build({
    sourceCommit: 'abc123',
    schemaVersion: 'v1',
    identityVersion: 'mel-v1',
    configVersion: 'cfg-v1',
    artifacts: [{ id: 'worker', checksum: 'artifact-sha' }],
    exports: [{ id: 'memory-export', checksum: 'memory-sha' }],
    destinations: [{ id: 'cold-store-1', authorized: true, encrypted: true }],
  });
  const standby = {
    standby_id: 'standby-1',
    recovery: {
      bundle_id: 'bundle-1',
      source_commit: bundle.source.commit,
      manifest_sha256: bundle.manifestSha256,
      verified: true,
    },
    destination: {
      id: 'cold-store-1',
      provider: 'provider-neutral',
      authorized: true,
      encrypted: true,
    },
    readiness: {
      snapshot_present: true,
      config_present: true,
      identity_present: true,
      restore_tested: true,
      integrity_verified: true,
      checked_at: '2026-09-15T18:05:00Z',
    },
  };
  const input = {
    drill_id: 'drill-1',
    dry_run: true,
    environment: {
      id: 'sandbox-restore-1',
      kind: 'SANDBOX',
      isolated: true,
      production_access: false,
    },
    bundle,
    standby,
    expected_checks: ['identity', 'config', 'memory', 'worker'],
    approval: {
      approved: true,
      action: 'RUN_RECOVERY_DRILL',
      drill_id: 'drill-1',
      manifest_sha256: bundle.manifestSha256,
    },
  };
  return { builder, bundle, standby, input };
}

test('GEN2-48 gate accepts only an approved isolated dry-run with READY standby', async () => {
  const { input } = await fixture();
  const result = evaluateRecoveryDrill(input);
  assert.equal(result.schema, RECOVERY_DRILL_SCHEMA);
  assert.equal(result.allowed, true);
  assert.equal(result.state, RECOVERY_DRILL_STATE.READY);
  assert.deepEqual(result.failures, []);
});

test('GEN2-48 gate forbids production access and non-sandbox environments', async () => {
  const { input } = await fixture();
  const result = evaluateRecoveryDrill({
    ...input,
    dry_run: false,
    environment: {
      ...input.environment,
      kind: 'PRODUCTION',
      isolated: false,
      production_access: true,
    },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.state, RECOVERY_DRILL_STATE.DENIED);
  assert.ok(result.failures.includes('DRY_RUN_REQUIRED'));
  assert.ok(result.failures.includes('SANDBOX_ENVIRONMENT_REQUIRED'));
  assert.ok(result.failures.includes('ENVIRONMENT_ISOLATION_REQUIRED'));
  assert.ok(result.failures.includes('PRODUCTION_ACCESS_FORBIDDEN'));
});

test('GEN2-48 owner halt always wins', async () => {
  const { input } = await fixture();
  const result = evaluateRecoveryDrill({ ...input, owner_halt: true });
  assert.equal(result.allowed, false);
  assert.ok(result.failures.includes('OWNER_HALT_ACTIVE'));
});

test('GEN2-48 requires approval scoped to exact drill and manifest', async () => {
  const { input } = await fixture();
  const noApproval = evaluateRecoveryDrill({ ...input, approval: null });
  assert.equal(noApproval.allowed, false);
  assert.ok(noApproval.failures.includes('EXACT_DRILL_APPROVAL_REQUIRED'));

  const wrongManifest = evaluateRecoveryDrill({
    ...input,
    approval: { ...input.approval, manifest_sha256: 'b'.repeat(64) },
  });
  assert.equal(wrongManifest.allowed, false);
  assert.ok(wrongManifest.failures.includes('EXACT_DRILL_APPROVAL_REQUIRED'));
});

test('GEN2-48 requires a READY cold standby but never requests activation', async () => {
  const { input } = await fixture();
  const result = evaluateRecoveryDrill({
    ...input,
    standby: {
      ...input.standby,
      readiness: { ...input.standby.readiness, restore_tested: false },
      activation: {
        requested: true,
        mode: 'MANUAL',
        approval: {
          approved: true,
          action: 'ACTIVATE_COLD_STANDBY',
          standby_id: input.standby.standby_id,
          manifest_sha256: input.bundle.manifestSha256,
        },
      },
    },
  });
  assert.equal(result.allowed, false);
  assert.ok(result.failures.includes('COLD_STANDBY_NOT_READY'));
});

test('GEN2-48 normalization is deterministic and bounds duplicate checks', async () => {
  const { input } = await fixture();
  const normalized = normalizeRecoveryDrill({
    ...input,
    drill_id: ' drill-1 ',
    environment: { ...input.environment, kind: ' sandbox ' },
    expected_checks: ['identity', ' identity ', '', 'config'],
    approval: { ...input.approval, manifest_sha256: input.bundle.manifestSha256.toUpperCase() },
  });
  assert.equal(normalized.schema, RECOVERY_DRILL_SCHEMA);
  assert.equal(normalized.drill_id, 'drill-1');
  assert.equal(normalized.environment.kind, 'SANDBOX');
  assert.deepEqual(normalized.expected_checks, ['identity', 'config']);
  assert.equal(normalized.approval.manifest_sha256, input.bundle.manifestSha256);
});

test('GEN2-48 controller verifies bundle, validates restore and always tears down', async () => {
  const { builder, input } = await fixture();
  const calls = [];
  const audits = [];
  const controller = createRecoveryDrillController({
    bundleBuilder: builder,
    adapter: {
      async stage(payload) {
        calls.push(['stage', payload.environment.id]);
      },
      async validate(payload) {
        calls.push(['validate', payload.environment_id]);
        return {
          ok: true,
          checks: payload.expected_checks.map((id) => ({ id, ok: true })),
        };
      },
      async teardown(payload) {
        calls.push(['teardown', payload.environment_id]);
      },
    },
    authorize: async permission => permission === 'resilience:recovery:drill',
    audit: async row => audits.push(row),
  });

  const report = await controller.run(input);
  assert.equal(report.ok, true);
  assert.equal(report.state, RECOVERY_DRILL_STATE.PASSED);
  assert.equal(report.production_access_used, false);
  assert.equal(report.activation_performed, false);
  assert.equal(report.teardown_completed, true);
  assert.ok(report.checks.every((row) => row.ok));
  assert.deepEqual(calls.map(([name]) => name), ['stage', 'validate', 'teardown']);
  assert.equal(audits.at(-1).state, RECOVERY_DRILL_STATE.PASSED);
});

test('GEN2-48 validation failure still tears down the sandbox and fails closed', async () => {
  const { builder, input } = await fixture();
  const calls = [];
  const controller = createRecoveryDrillController({
    bundleBuilder: builder,
    adapter: {
      async stage() { calls.push('stage'); },
      async validate() {
        calls.push('validate');
        return { ok: true, checks: [{ id: 'identity', ok: true }] };
      },
      async teardown() { calls.push('teardown'); },
    },
    authorize: async () => true,
    audit: async () => {},
  });

  await assert.rejects(
    controller.run(input),
    error => error.code === 'RECOVERY_DRILL_VALIDATION_FAILED'
      && error.failed_checks.includes('config')
      && error.failed_checks.includes('memory'),
  );
  assert.deepEqual(calls, ['stage', 'validate', 'teardown']);
});

test('GEN2-48 detects bundle tampering before staging any restore', async () => {
  const { builder, input } = await fixture();
  let staged = false;
  const controller = createRecoveryDrillController({
    bundleBuilder: builder,
    adapter: {
      async stage() { staged = true; },
      async validate() { return { ok: true, checks: [] }; },
      async teardown() {},
    },
    authorize: async () => true,
    audit: async () => {},
  });

  const tampered = {
    ...input,
    bundle: {
      ...input.bundle,
      source: { commit: 'tampered-commit' },
    },
  };
  await assert.rejects(
    controller.run(tampered),
    error => error.code === 'MANIFEST_INTEGRITY_MISMATCH',
  );
  assert.equal(staged, false);
});

test('GEN2-48 global permission denial prevents staging', async () => {
  const { builder, input } = await fixture();
  let staged = false;
  const controller = createRecoveryDrillController({
    bundleBuilder: builder,
    adapter: {
      async stage() { staged = true; },
      async validate() { return { ok: true, checks: [] }; },
      async teardown() {},
    },
    authorize: async () => false,
    audit: async () => {},
  });
  await assert.rejects(
    controller.run(input),
    error => error.code === 'GLOBAL_PERMISSION_DENIED',
  );
  assert.equal(staged, false);
});
