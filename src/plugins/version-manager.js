import { requireValue } from '../core/contracts.js';
import { transition } from '../core/lifecycle/extension.js';
import { validateManifest } from './validator.js';

const ACTIVE = 'ACTIVE';
const REACTIVATABLE = new Set(['DISABLED', 'ROLLED_BACK']);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function required(value, code) {
  const normalized = String(value ?? '').trim();
  requireValue(normalized.length > 0, code, 400);
  return normalized;
}

function object(value, code) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), code, 400);
  return value;
}

function releaseProof(proofs, version) {
  object(proofs, 'PLUGIN_RELEASE_PROOFS_REQUIRED');
  const normalized = {
    tests: proofs.tests === true,
    sandbox: proofs.sandbox === true,
    security: proofs.security === true,
    activation: proofs.activation === true,
    version: required(proofs.version, 'PLUGIN_RELEASE_VERSION_REQUIRED'),
    artifact_digest: required(proofs.artifact_digest, 'PLUGIN_ARTIFACT_DIGEST_REQUIRED'),
    source_sha: required(proofs.source_sha, 'PLUGIN_SOURCE_SHA_REQUIRED'),
    approval_id: required(proofs.approval_id, 'PLUGIN_APPROVAL_ID_REQUIRED'),
  };
  requireValue(normalized.version === version, 'PLUGIN_RELEASE_VERSION_MISMATCH', 409);
  requireValue(/^[0-9a-f]{40}$/i.test(normalized.source_sha), 'PLUGIN_SOURCE_SHA_INVALID', 400);
  requireValue(/^sha256:[0-9a-f]{64}$/i.test(normalized.artifact_digest), 'PLUGIN_ARTIFACT_DIGEST_INVALID', 400);
  return normalized;
}

function testedProof(proofs, version) {
  object(proofs, 'PLUGIN_TEST_PROOFS_REQUIRED');
  const normalized = {
    tests: proofs.tests === true,
    version: required(proofs.version, 'PLUGIN_TEST_VERSION_REQUIRED'),
    suite: required(proofs.suite, 'PLUGIN_TEST_SUITE_REQUIRED'),
    run_id: required(proofs.run_id, 'PLUGIN_TEST_RUN_ID_REQUIRED'),
  };
  requireValue(normalized.version === version, 'PLUGIN_TEST_VERSION_MISMATCH', 409);
  requireValue(normalized.tests, 'PLUGIN_TEST_EVIDENCE_REQUIRED', 409);
  return normalized;
}

function publicRecord(record) {
  if (!record) return null;
  return clone({
    plugin_id: record.plugin_id,
    version: record.version,
    status: record.status,
    manifest: record.manifest,
    artifact_ref: record.artifact_ref,
    artifact_digest: record.artifact_digest || null,
    evidence: record.evidence || {},
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

function candidateRecord({ manifest, artifactRef, metadata = {}, now }) {
  const valid = validateManifest(manifest, 'plugin');
  let record = {
    plugin_id: valid.id,
    version: valid.version,
    status: 'DISCOVERED',
    manifest: valid,
    artifact_ref: required(artifactRef, 'PLUGIN_ARTIFACT_REF_REQUIRED'),
    artifact_digest: null,
    evidence: { metadata: clone(metadata) },
    created_at: now,
    updated_at: now,
  };
  record = transition(record, 'VALIDATED', {}, 'plugin');
  record = transition(record, 'CANDIDATE', {}, 'plugin');
  record.updated_at = now;
  return record;
}

/**
 * Durable control-plane registry for plugin versions.
 *
 * This manager never persists executable functions and never dynamically
 * imports an artifact. It stores only validated manifests, immutable artifact
 * identity and server-owned evidence. Runtime loading remains an explicit,
 * separately governed operation.
 */
export class PluginVersionManager {
  constructor(store, { now = () => Date.now() } = {}) {
    if (!store
      || typeof store.putVersion !== 'function'
      || typeof store.getVersion !== 'function'
      || typeof store.listVersions !== 'function'
      || typeof store.getActive !== 'function'
      || typeof store.setActive !== 'function'
      || typeof store.clearActive !== 'function') {
      throw new Error('PLUGIN_VERSION_STORE_REQUIRED');
    }
    this.store = store;
    this.now = now;
  }

  async installCandidate({ manifest, artifactRef, metadata = {} } = {}) {
    const valid = validateManifest(manifest, 'plugin');
    const existing = await this.store.getVersion(valid.id, valid.version);
    requireValue(!existing, 'PLUGIN_VERSION_EXISTS', 409);
    const record = candidateRecord({
      manifest: valid,
      artifactRef,
      metadata,
      now: this.now(),
    });
    await this.store.putVersion(record, { createOnly: true });
    return publicRecord(record);
  }

  async markTested(pluginId, version, proofs = {}) {
    const id = required(pluginId, 'PLUGIN_ID_REQUIRED');
    const v = required(version, 'PLUGIN_VERSION_REQUIRED');
    const current = await this.store.getVersion(id, v);
    requireValue(current, 'PLUGIN_VERSION_NOT_FOUND', 404);
    requireValue(current.status === 'CANDIDATE', 'PLUGIN_TEST_STATE_INVALID', 409);

    const evidence = testedProof(proofs, v);
    const updated = transition(current, 'TESTED', evidence, 'plugin');
    updated.updated_at = this.now();
    updated.evidence = {
      ...(current.evidence || {}),
      tests: evidence,
    };
    await this.store.putVersion(updated);
    return publicRecord(updated);
  }

  async activate(pluginId, version, proofs = {}) {
    const id = required(pluginId, 'PLUGIN_ID_REQUIRED');
    const v = required(version, 'PLUGIN_VERSION_REQUIRED');
    const current = await this.store.getVersion(id, v);
    requireValue(current, 'PLUGIN_VERSION_NOT_FOUND', 404);
    requireValue(current.status === 'TESTED' || REACTIVATABLE.has(current.status), 'PLUGIN_ACTIVATION_STATE_INVALID', 409);

    const evidence = releaseProof(proofs, v);
    requireValue(evidence.tests && evidence.sandbox && evidence.security && evidence.activation, 'PLUGIN_RELEASE_EVIDENCE_REQUIRED', 409);

    let source = current;
    if (REACTIVATABLE.has(current.status)) {
      // A rollback/reactivation is allowed only for a version that was already
      // fully activated before. We re-enter the canonical lifecycle using the
      // immutable prior release proof instead of skipping states.
      const prior = current.evidence?.release;
      requireValue(prior?.tests === true && prior?.sandbox === true && prior?.security === true && prior?.activation === true, 'PLUGIN_PRIOR_RELEASE_EVIDENCE_REQUIRED', 409);
      source = transition(current, 'CANDIDATE', {}, 'plugin');
      source = transition(source, 'TESTED', { tests: true, version: v }, 'plugin');
    }

    const activated = transition(source, ACTIVE, evidence, 'plugin');
    activated.updated_at = this.now();
    activated.artifact_digest = evidence.artifact_digest;
    activated.evidence = {
      ...(current.evidence || {}),
      release: evidence,
    };

    const previousActive = await this.store.getActive(id);
    if (previousActive && previousActive.version !== v) {
      const previousRecord = await this.store.getVersion(id, previousActive.version);
      if (previousRecord?.status === ACTIVE) {
        const disabled = transition(previousRecord, 'DISABLED', {}, 'plugin');
        disabled.updated_at = this.now();
        await this.store.putVersion(disabled);
      }
    }

    await this.store.putVersion(activated);
    await this.store.setActive(id, v, {
      activated_at: this.now(),
      previous_version: previousActive?.version || null,
    });
    return {
      active: publicRecord(activated),
      previous_version: previousActive?.version || null,
    };
  }

  async disable(pluginId, { reason = 'disabled' } = {}) {
    const id = required(pluginId, 'PLUGIN_ID_REQUIRED');
    const active = await this.store.getActive(id);
    requireValue(active, 'PLUGIN_ACTIVE_VERSION_NOT_FOUND', 404);
    const current = await this.store.getVersion(id, active.version);
    requireValue(current?.status === ACTIVE, 'PLUGIN_ACTIVE_STATE_CORRUPT', 500);
    const disabled = transition(current, 'DISABLED', {}, 'plugin');
    disabled.updated_at = this.now();
    disabled.evidence = {
      ...(current.evidence || {}),
      disabled: { reason: String(reason || 'disabled'), at: disabled.updated_at },
    };
    await this.store.putVersion(disabled);
    await this.store.clearActive(id);
    return publicRecord(disabled);
  }

  async rollback(pluginId, targetVersion, proofs = {}) {
    const id = required(pluginId, 'PLUGIN_ID_REQUIRED');
    const target = required(targetVersion, 'PLUGIN_ROLLBACK_TARGET_REQUIRED');
    const active = await this.store.getActive(id);
    requireValue(active, 'PLUGIN_ACTIVE_VERSION_NOT_FOUND', 404);
    requireValue(active.version !== target, 'PLUGIN_ROLLBACK_TARGET_IS_ACTIVE', 409);

    const current = await this.store.getVersion(id, active.version);
    requireValue(current?.status === ACTIVE, 'PLUGIN_ACTIVE_STATE_CORRUPT', 500);
    const targetRecord = await this.store.getVersion(id, target);
    requireValue(targetRecord, 'PLUGIN_ROLLBACK_TARGET_NOT_FOUND', 404);
    requireValue(
      targetRecord.status === 'DISABLED' || targetRecord.status === 'ROLLED_BACK',
      'PLUGIN_ROLLBACK_TARGET_STATE_INVALID',
      409,
    );

    const targetRelease = targetRecord.evidence?.release;
    requireValue(targetRelease?.activation === true, 'PLUGIN_ROLLBACK_TARGET_UNVERIFIED', 409);

    const rollbackProof = releaseProof({
      ...targetRelease,
      ...proofs,
      version: target,
      tests: true,
      sandbox: true,
      security: true,
      activation: true,
      artifact_digest: proofs.artifact_digest || targetRelease.artifact_digest,
      source_sha: proofs.source_sha || targetRelease.source_sha,
      approval_id: proofs.approval_id || targetRelease.approval_id,
    }, target);

    const rolledBack = transition(current, 'ROLLED_BACK', {}, 'plugin');
    rolledBack.updated_at = this.now();
    rolledBack.evidence = {
      ...(current.evidence || {}),
      rollback: {
        target_version: target,
        approval_id: rollbackProof.approval_id,
        at: rolledBack.updated_at,
      },
    };
    await this.store.putVersion(rolledBack);
    await this.store.clearActive(id);

    const result = await this.activate(id, target, rollbackProof);
    return {
      rolled_back_from: publicRecord(rolledBack),
      restored: result.active,
    };
  }

  async get(pluginId, version = null) {
    const id = required(pluginId, 'PLUGIN_ID_REQUIRED');
    if (version) return publicRecord(await this.store.getVersion(id, version));
    const active = await this.store.getActive(id);
    if (!active) return null;
    return publicRecord(await this.store.getVersion(id, active.version));
  }

  async list(pluginId) {
    const id = required(pluginId, 'PLUGIN_ID_REQUIRED');
    return (await this.store.listVersions(id)).map(publicRecord);
  }
}
