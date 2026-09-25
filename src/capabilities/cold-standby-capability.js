import { createR2D1BackupStorage } from '../backup/system-backup-runtime.js';
import { requireValue } from '../core/contracts.js';
import {
  COLD_STANDBY_STATE,
  createColdStandbyPlan,
  evaluateColdStandby,
} from '../resilience/cold-standby.js';
import { runRecoveryDrillAgainstSnapshot } from './recovery-drill-capability.js';

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function hasPassedCheck(report, id) {
  return Array.isArray(report?.checks)
    && report.checks.some((row) => row?.id === id && row?.ok === true);
}

function normalizeDestination(destination = {}) {
  const value = {
    id: text(destination.id),
    provider: text(destination.provider, 120),
    location_hint: text(destination.location_hint, 300),
    authorized: destination.authorized === true,
    encrypted: destination.encrypted === true,
  };
  requireValue(value.id, 'COLD_STANDBY_DESTINATION_REQUIRED', 400);
  requireValue(value.provider, 'COLD_STANDBY_PROVIDER_REQUIRED', 400);
  requireValue(value.authorized, 'COLD_STANDBY_AUTHORIZED_DESTINATION_REQUIRED', 403);
  requireValue(value.encrypted, 'COLD_STANDBY_ENCRYPTED_DESTINATION_REQUIRED', 409);
  return value;
}

export async function prepareColdStandbyAgainstSnapshot(snapshot, {
  owner = false,
  approved = false,
  destination = {},
  now = () => new Date().toISOString(),
} = {}) {
  requireValue(owner === true, 'COLD_STANDBY_OWNER_REQUIRED', 403);
  requireValue(approved === true, 'COLD_STANDBY_EXPLICIT_APPROVAL_REQUIRED', 403);
  const target = normalizeDestination(destination);

  const drill = await runRecoveryDrillAgainstSnapshot(snapshot, {
    owner: true,
    approved: true,
    now,
  });
  requireValue(drill?.ok === true && drill?.state === 'PASSED', 'COLD_STANDBY_RECOVERY_DRILL_REQUIRED', 409);

  const runtimeVerified = hasPassedCheck(drill, 'runtime-descriptor');
  const integrityVerified = drill.restore_candidate_verified === true
    && hasPassedCheck(drill, 'snapshot-integrity');
  const restoreTested = drill.teardown_completed === true
    && drill.production_access_used === false
    && drill.activation_performed === false
    && hasPassedCheck(drill, 'd1-logical-state');

  const standby = {
    standby_id: `cold-${snapshot.id}`.slice(0, 240),
    recovery: {
      bundle_id: snapshot.id,
      source_commit: drill.deployed_sha,
      manifest_sha256: drill.manifest_sha256,
      verified: integrityVerified,
    },
    destination: target,
    readiness: {
      snapshot_present: true,
      config_present: runtimeVerified,
      identity_present: runtimeVerified && Boolean(drill.deployed_sha),
      restore_tested: restoreTested,
      integrity_verified: integrityVerified,
      checked_at: now(),
    },
    activation: {
      requested: false,
      mode: 'MANUAL',
    },
  };
  const gate = evaluateColdStandby(standby);
  requireValue(gate.state === COLD_STANDBY_STATE.READY, gate.failures[0] || 'COLD_STANDBY_NOT_READY', 409);
  const plan = createColdStandbyPlan(standby);

  return Object.freeze({
    ok: true,
    status: 'PREPARED_MANUAL_COLD_STANDBY',
    snapshot_id: snapshot.id,
    standby_id: plan.standby_id,
    manifest_sha256: plan.manifest_sha256,
    destination_id: plan.destination_id,
    destination_provider: plan.destination_provider,
    plan,
    recovery_drill: Object.freeze({
      state: drill.state,
      drill_id: drill.drill_id,
      restore_candidate_verified: drill.restore_candidate_verified,
      reconstructed_tables: drill.reconstructed_tables,
      reconstructed_rows: drill.reconstructed_rows,
      production_access_used: drill.production_access_used,
      activation_performed: drill.activation_performed,
      teardown_completed: drill.teardown_completed,
    }),
    activation_performed: false,
    automatic_activation: false,
    manual_activation_required: true,
  });
}
export function registerColdStandbyCapability(bus, env = {}) {
  const ready = Boolean(env?.DB?.prepare && env?.MEDIA_BUCKET?.get);
  bus.discover({
    id: 'resilience.cold-standby.prepare.latest',
    name: 'Préparer un cold standby manuel',
    category: 'resilience',
    version: '1.0.0',
    provider: 'core',
    description: 'Runs an owner-approved recovery drill and produces a manual-only cold-standby plan. It never activates or fails over production.',
    input_schema: {
      type: 'object',
      properties: {
        snapshot_id: { type: 'string', minLength: 1, maxLength: 160 },
        approved: { type: 'boolean' },
        destination: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 240 },
            provider: { type: 'string', minLength: 1, maxLength: 120 },
            location_hint: { type: 'string', maxLength: 300 },
            authorized: { type: 'boolean' },
            encrypted: { type: 'boolean' },
          },
          required: ['id', 'provider', 'authorized', 'encrypted'],
          additionalProperties: false,
        },
      },
      required: ['approved', 'destination'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: ready ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context = {}) => {
    requireValue(input?.approved === true, 'COLD_STANDBY_EXPLICIT_APPROVAL_REQUIRED', 403);
    requireValue(context?.owner, 'COLD_STANDBY_OWNER_REQUIRED', 403);
    requireValue(env?.DB?.prepare, 'BACKUP_DB_UNAVAILABLE', 503);
    requireValue(env?.MEDIA_BUCKET?.get, 'BACKUP_R2_UNAVAILABLE', 503);

    const storage = createR2D1BackupStorage({ db: env.DB, bucket: env.MEDIA_BUCKET });
    let snapshotId = text(input.snapshot_id, 160);
    if (!snapshotId) {
      const latest = (await storage.list({ limit: 1 }))[0] || null;
      snapshotId = text(latest?.id, 160);
    }
    requireValue(snapshotId, 'COLD_STANDBY_BACKUP_NOT_FOUND', 404);

    const snapshot = await storage.get(snapshotId);
    requireValue(snapshot, 'COLD_STANDBY_BACKUP_NOT_FOUND', 404);
    return prepareColdStandbyAgainstSnapshot(snapshot, {
      owner: true,
      approved: true,
      destination: input.destination,
    });
  });
}
