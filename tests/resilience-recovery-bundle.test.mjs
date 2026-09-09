import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryBundleBuilder } from '../src/resilience/recovery-bundle.js';

test('recovery bundle is portable, integrity checked and only targets authorized destinations', async () => {
  const builder = new RecoveryBundleBuilder({ now: () => '2026-09-09T16:10:00.000Z' });
  const bundle = await builder.build({
    sourceCommit: 'abc123',
    schemaVersion: 'd1-v3',
    identityVersion: 'mel-identity-v1',
    configVersion: 'cfg-v4',
    artifacts: [{ name: 'worker', sha256: 'deadbeef' }],
    exports: [{ name: 'memory-export', sha256: 'cafebabe', password: 'must-not-leak' }],
    destinations: [
      { id: 'drive-backup', kind: 'cloud-archive', authorized: true, encrypted: true },
      { id: 'unknown-free-space', kind: 'cloud-archive', authorized: false },
    ],
  });

  assert.equal(bundle.type, 'MEL_RECOVERY_BUNDLE_V1');
  assert.equal(bundle.authorizedDestinations.length, 1);
  assert.equal(bundle.authorizedDestinations[0].id, 'drive-backup');
  assert.equal(bundle.exports[0].password, '[REDACTED]');
  assert.equal(bundle.restore.automaticActivation, false);
  assert.equal(bundle.policy.hiddenReplicationForbidden, true);

  const verified = await builder.verify(bundle);
  assert.equal(verified.ok, true);

  const plan = builder.replicationPlan(bundle);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].mode, 'AUTHORIZED_BACKUP_COPY');
  assert.equal(plan[0].automaticActivation, false);
  assert.equal(plan[0].requiresOperatorRestore, true);
});

test('tampered recovery bundle fails integrity verification', async () => {
  const builder = new RecoveryBundleBuilder();
  const bundle = await builder.build({ sourceCommit: 'abc123' });
  bundle.source.commit = 'attacker-commit';
  const verified = await builder.verify(bundle);
  assert.equal(verified.ok, false);
  assert.equal(verified.code, 'MANIFEST_INTEGRITY_MISMATCH');
});
