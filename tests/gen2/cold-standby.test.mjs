import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLD_STANDBY_SCHEMA,
  COLD_STANDBY_STATE,
  createColdStandbyController,
  createColdStandbyPlan,
  evaluateColdStandby,
  normalizeColdStandby,
} from '../../src/resilience/cold-standby.js';

const manifest = 'a'.repeat(64);

const ready = {
  standby_id: 'standby-eu-1',
  recovery: {
    bundle_id: 'bundle-42',
    source_commit: 'abc123',
    manifest_sha256: manifest,
    verified: true,
  },
  destination: {
    id: 'cold-store-1',
    provider: 'provider-neutral',
    location_hint: 'authorized cold storage',
    authorized: true,
    encrypted: true,
  },
  readiness: {
    snapshot_present: true,
    config_present: true,
    identity_present: true,
    restore_tested: true,
    integrity_verified: true,
    checked_at: '2026-09-15T18:00:00Z',
  },
};

const approvedActivation = {
  ...ready,
  activation: {
    requested: true,
    mode: 'MANUAL',
    approval: {
      approved: true,
      action: 'ACTIVATE_COLD_STANDBY',
      standby_id: ready.standby_id,
      manifest_sha256: manifest,
    },
  },
};

test('MEL-RES-04 reports a verified standby READY without activating it', () => {
  const result = evaluateColdStandby(ready);
  assert.equal(result.state, COLD_STANDBY_STATE.READY);
  assert.equal(result.ready, true);
  assert.equal(result.activation_allowed, false);
  assert.deepEqual(result.failures, []);
});

test('MEL-RES-04 fails closed when readiness prerequisites are missing', () => {
  const result = evaluateColdStandby({
    ...ready,
    recovery: { ...ready.recovery, verified: false },
    destination: { ...ready.destination, encrypted: false },
    readiness: { ...ready.readiness, restore_tested: false, integrity_verified: false },
  });
  assert.equal(result.state, COLD_STANDBY_STATE.NOT_READY);
  assert.equal(result.ready, false);
  assert.ok(result.failures.includes('RECOVERY_BUNDLE_VERIFICATION_REQUIRED'));
  assert.ok(result.failures.includes('ENCRYPTED_DESTINATION_REQUIRED'));
  assert.ok(result.failures.includes('RESTORE_TEST_REQUIRED'));
  assert.ok(result.failures.includes('INTEGRITY_VERIFICATION_REQUIRED'));
});

test('MEL-RES-04 owner halt always denies preparation or activation', () => {
  const result = evaluateColdStandby({ ...approvedActivation, owner_halt: true });
  assert.equal(result.state, COLD_STANDBY_STATE.DENIED);
  assert.equal(result.activation_allowed, false);
  assert.deepEqual(result.failures, ['OWNER_HALT_ACTIVE']);
});

test('MEL-RES-04 forbids automatic activation even when otherwise ready', () => {
  const result = evaluateColdStandby({
    ...approvedActivation,
    activation: { ...approvedActivation.activation, mode: 'AUTO' },
  });
  assert.equal(result.state, COLD_STANDBY_STATE.DENIED);
  assert.deepEqual(result.failures, ['AUTOMATIC_ACTIVATION_FORBIDDEN']);
});

test('MEL-RES-04 requires approval scoped to exact standby and manifest', () => {
  const noApproval = evaluateColdStandby({
    ...ready,
    activation: { requested: true, mode: 'MANUAL' },
  });
  assert.equal(noApproval.state, COLD_STANDBY_STATE.DENIED);
  assert.deepEqual(noApproval.failures, ['EXACT_ACTIVATION_APPROVAL_REQUIRED']);

  const wrongManifest = evaluateColdStandby({
    ...approvedActivation,
    activation: {
      ...approvedActivation.activation,
      approval: { ...approvedActivation.activation.approval, manifest_sha256: 'b'.repeat(64) },
    },
  });
  assert.equal(wrongManifest.state, COLD_STANDBY_STATE.DENIED);

  const allowed = evaluateColdStandby(approvedActivation);
  assert.equal(allowed.state, COLD_STANDBY_STATE.ACTIVATION_AUTHORIZED);
  assert.equal(allowed.activation_allowed, true);
});

test('MEL-RES-04 normalization keeps a deterministic provider-neutral contract', () => {
  const normalized = normalizeColdStandby({
    ...ready,
    standby_id: ' standby-eu-1 ',
    recovery: { ...ready.recovery, manifest_sha256: manifest.toUpperCase() },
  });
  assert.equal(normalized.schema, COLD_STANDBY_SCHEMA);
  assert.equal(normalized.standby_id, 'standby-eu-1');
  assert.equal(normalized.recovery.manifest_sha256, manifest);
  assert.equal(normalized.activation.mode, 'MANUAL');
});

test('MEL-RES-04 plan explicitly preserves manual-only activation policy', () => {
  const plan = createColdStandbyPlan(ready);
  assert.equal(plan.schema, COLD_STANDBY_SCHEMA);
  assert.equal(plan.state, COLD_STANDBY_STATE.READY);
  assert.equal(plan.activation_mode, 'MANUAL');
  assert.equal(plan.policy.automatic_activation, false);
  assert.equal(plan.policy.owner_halt_always_wins, true);
  assert.equal(plan.policy.exact_manifest_approval_required, true);
});

test('MEL-RES-04 controller prepares through an injected adapter only after permission', async () => {
  const prepared = [];
  const audits = [];
  const controller = createColdStandbyController({
    adapter: {
      async prepare(plan) {
        prepared.push(plan);
        return { copied: true };
      },
      async activate() {
        assert.fail('activate must not run while preparing');
      },
    },
    authorize: async permission => permission === 'resilience:standby:prepare',
    audit: async row => audits.push(row),
  });

  const result = await controller.prepare(ready);
  assert.equal(result.ok, true);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].state, COLD_STANDBY_STATE.READY);
  assert.equal(audits.at(-1).status, 'PREPARED');

  const denied = createColdStandbyController({
    adapter: {
      async prepare() { assert.fail('adapter must not run'); },
      async activate() { assert.fail('adapter must not run'); },
    },
    authorize: async () => false,
    audit: async row => audits.push(row),
  });
  await assert.rejects(
    denied.prepare(ready),
    error => error.code === 'GLOBAL_PERMISSION_DENIED',
  );
  assert.equal(audits.at(-1).status, 'PREPARE_DENIED');
});

test('MEL-RES-04 controller activation requires both exact request approval and global permission', async () => {
  const activated = [];
  const audits = [];
  const controller = createColdStandbyController({
    adapter: {
      async prepare() { assert.fail('prepare must not run'); },
      async activate(plan) {
        activated.push(plan);
        return { restored: true };
      },
    },
    authorize: async permission => permission === 'resilience:standby:activate',
    audit: async row => audits.push(row),
  });

  const result = await controller.activate(approvedActivation);
  assert.equal(result.ok, true);
  assert.equal(activated.length, 1);
  assert.equal(activated[0].state, COLD_STANDBY_STATE.ACTIVATION_AUTHORIZED);
  assert.equal(audits.at(-1).status, 'ACTIVATED');

  await assert.rejects(
    controller.activate({ ...ready, activation: { requested: true, mode: 'MANUAL' } }),
    error => error.code === 'EXACT_ACTIVATION_APPROVAL_REQUIRED',
  );
  assert.equal(audits.at(-1).status, 'ACTIVATION_DENIED');
});
