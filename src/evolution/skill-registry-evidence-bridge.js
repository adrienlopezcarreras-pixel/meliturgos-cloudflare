function required(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function capabilities(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('SKILL_BRIDGE_CAPABILITIES_REQUIRED');
  const normalized = [...new Set(values.map(value => required(value, 'SKILL_BRIDGE_CAPABILITY_INVALID')))];
  normalized.sort();
  return normalized;
}

function stageEvidence(pipeline) {
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
  return stages.map((row, index) => ({
    id: `module-lab:${String(row?.stage || index).toLowerCase()}`,
    status: String(row?.status || '').toLowerCase() === 'pass' ? 'pass' : 'failed',
    stage: String(row?.stage || ''),
  }));
}

function assertModuleCandidatePipeline(pipeline) {
  if (!pipeline || pipeline.ok !== true || pipeline.status !== 'CANDIDATE') {
    throw new Error('SKILL_BRIDGE_MODULE_CANDIDATE_REQUIRED');
  }
  if (pipeline.activation_allowed !== false || pipeline.release_gate_required !== true) {
    throw new Error('SKILL_BRIDGE_MODULE_RELEASE_GATE_REQUIRED');
  }
  const requiredStages = new Set([
    'AI_STATE_OF_PLAY',
    'INSPECTION',
    'PLAN_GATE',
    'SPEC',
    'GENERATE',
    'VALIDATE',
    'TEST',
    'SANDBOX',
    'SECURITY_REVIEW',
  ]);
  const passed = new Set(
    (pipeline.stages || [])
      .filter(row => String(row?.status || '').toUpperCase() === 'PASS')
      .map(row => String(row?.stage || '').toUpperCase())
  );
  for (const stage of requiredStages) {
    if (!passed.has(stage)) throw new Error(`SKILL_BRIDGE_MODULE_STAGE_MISSING:${stage}`);
  }
  if (!String(pipeline.module_id || '').trim()) throw new Error('SKILL_BRIDGE_MODULE_ID_REQUIRED');
  if (!String(pipeline.candidate_ref || '').trim()) throw new Error('SKILL_BRIDGE_CANDIDATE_REF_REQUIRED');
  return pipeline;
}

function assertReleaseEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('SKILL_BRIDGE_RELEASE_EVIDENCE_REQUIRED');
  }
  if (evidence.approved !== true) throw new Error('SKILL_BRIDGE_RELEASE_APPROVAL_REQUIRED');
  if (evidence.tests_passed !== true) throw new Error('SKILL_BRIDGE_RELEASE_TESTS_REQUIRED');
  if (evidence.sandbox_passed !== true) throw new Error('SKILL_BRIDGE_RELEASE_SANDBOX_REQUIRED');
  if (evidence.security_passed !== true) throw new Error('SKILL_BRIDGE_RELEASE_SECURITY_REQUIRED');
  required(evidence.artifact_digest, 'SKILL_BRIDGE_ARTIFACT_DIGEST_REQUIRED');
  const sourceSha = required(evidence.source_sha, 'SKILL_BRIDGE_SOURCE_SHA_REQUIRED');
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error('SKILL_BRIDGE_SOURCE_SHA_INVALID');
  return evidence;
}

function assertActiveLearningAdapter(active) {
  if (!active || typeof active !== 'object' || Array.isArray(active)) {
    throw new Error('SKILL_BRIDGE_ACTIVE_ADAPTER_REQUIRED');
  }
  if (active?.approval?.approved !== true) throw new Error('SKILL_BRIDGE_ADAPTER_APPROVAL_REQUIRED');
  if (active?.benchmark?.decision?.promote !== true) throw new Error('SKILL_BRIDGE_ADAPTER_BENCHMARK_REQUIRED');
  required(active?.adapter?.id, 'SKILL_BRIDGE_ADAPTER_ID_REQUIRED');
  required(active?.adapter?.digest, 'SKILL_BRIDGE_ADAPTER_DIGEST_REQUIRED');
  required(active?.dataset_digest, 'SKILL_BRIDGE_ADAPTER_DATASET_REQUIRED');
  return active;
}

async function maybePersist(registry, persist) {
  if (!persist) return false;
  if (typeof registry?.persist !== 'function') throw new Error('SKILL_BRIDGE_REGISTRY_PERSIST_REQUIRED');
  await registry.persist();
  return true;
}

/**
 * Evidence-only bridge into the immutable SkillRegistry.
 *
 * Candidate module versions and verified release versions are intentionally
 * distinct records. A candidate can never be activated merely because its
 * Module Lab tests passed; activation requires a separate release proof.
 */
export class SkillRegistryEvidenceBridge {
  constructor(registry) {
    if (!registry || typeof registry.register !== 'function' || typeof registry.activate !== 'function') {
      throw new Error('SKILL_BRIDGE_REGISTRY_REQUIRED');
    }
    this.registry = registry;
  }

  async registerModuleCandidate({
    skillId,
    name,
    version,
    capabilities: skillCapabilities,
    pipeline,
    metadata = {},
    persist = false,
  } = {}) {
    const checked = assertModuleCandidatePipeline(pipeline);
    const record = this.registry.register({
      skillId: required(skillId, 'SKILL_BRIDGE_SKILL_ID_REQUIRED'),
      name: required(name, 'SKILL_BRIDGE_SKILL_NAME_REQUIRED'),
      version: required(version, 'SKILL_BRIDGE_VERSION_REQUIRED'),
      capabilities: capabilities(skillCapabilities),
      state: 'candidate',
      evidence: [
        ...stageEvidence(checked),
        {
          id: 'module-lab:candidate',
          status: 'pass',
          module_id: checked.module_id,
          candidate_ref: checked.candidate_ref,
          release_gate_required: true,
        },
      ],
      metadata: {
        ...metadata,
        source: 'module-lab',
        module_id: checked.module_id,
        candidate_ref: checked.candidate_ref,
        release_gate_required: true,
      },
    });
    await maybePersist(this.registry, persist);
    return record;
  }

  async verifyModuleRelease({
    skillId,
    name,
    candidateVersion,
    verifiedVersion,
    capabilities: skillCapabilities,
    releaseEvidence,
    metadata = {},
    activate = true,
    persist = false,
  } = {}) {
    const normalizedSkillId = required(skillId, 'SKILL_BRIDGE_SKILL_ID_REQUIRED');
    const candidate = this.registry.resolve(
      normalizedSkillId,
      required(candidateVersion, 'SKILL_BRIDGE_CANDIDATE_VERSION_REQUIRED'),
    );
    if (candidate.state !== 'candidate') throw new Error('SKILL_BRIDGE_CANDIDATE_STATE_REQUIRED');

    const verified = assertReleaseEvidence(releaseEvidence);
    const version = required(verifiedVersion, 'SKILL_BRIDGE_VERIFIED_VERSION_REQUIRED');
    if (version === candidate.version) throw new Error('SKILL_BRIDGE_VERIFIED_VERSION_MUST_DIFFER');

    const record = this.registry.register({
      skillId: normalizedSkillId,
      name: required(name || candidate.name, 'SKILL_BRIDGE_SKILL_NAME_REQUIRED'),
      version,
      capabilities: capabilities(skillCapabilities || candidate.capabilities),
      state: 'verified',
      evidence: [
        {
          id: 'module-lab:candidate-lineage',
          status: 'pass',
          candidate_version: candidate.version,
          candidate_ref: candidate.metadata?.candidate_ref || null,
        },
        {
          id: 'release-gate:approval',
          status: 'verified',
          approval_id: String(verified.approval_id || ''),
          source_sha: String(verified.source_sha),
          artifact_digest: String(verified.artifact_digest),
          tests_passed: true,
          sandbox_passed: true,
          security_passed: true,
        },
      ],
      metadata: {
        ...candidate.metadata,
        ...metadata,
        source: 'module-release',
        candidate_version: candidate.version,
        source_sha: String(verified.source_sha),
        artifact_digest: String(verified.artifact_digest),
      },
    });

    const activation = activate ? this.registry.activate(normalizedSkillId, version) : null;
    await maybePersist(this.registry, persist);
    return { record, activation };
  }

  async registerLearningAdapter({
    skillId,
    name,
    version,
    capabilities: skillCapabilities,
    activeAdapter,
    metadata = {},
    activate = true,
    persist = false,
  } = {}) {
    const active = assertActiveLearningAdapter(activeAdapter);
    const normalizedSkillId = required(skillId, 'SKILL_BRIDGE_SKILL_ID_REQUIRED');
    const normalizedVersion = required(version, 'SKILL_BRIDGE_VERSION_REQUIRED');

    const record = this.registry.register({
      skillId: normalizedSkillId,
      name: required(name, 'SKILL_BRIDGE_SKILL_NAME_REQUIRED'),
      version: normalizedVersion,
      capabilities: capabilities(skillCapabilities),
      state: 'verified',
      evidence: [
        {
          id: 'learning-engine:adapter-active',
          status: 'verified',
          adapter_id: String(active.adapter.id),
          adapter_digest: String(active.adapter.digest),
          finetune_id: String(active.finetune_id || active.adapter.finetune_id || ''),
          dataset_digest: String(active.dataset_digest),
          plan_id: String(active.plan_id || ''),
        },
        {
          id: 'learning-engine:benchmark',
          status: 'pass',
          reason: String(active.benchmark?.decision?.reason || ''),
          baseline: active.benchmark?.baseline ?? null,
          candidate: active.benchmark?.candidate ?? null,
        },
      ],
      metadata: {
        ...metadata,
        source: 'learning-engine',
        adapter_id: String(active.adapter.id),
        adapter_digest: String(active.adapter.digest),
        dataset_digest: String(active.dataset_digest),
      },
    });

    const activation = activate ? this.registry.activate(normalizedSkillId, normalizedVersion) : null;
    await maybePersist(this.registry, persist);
    return { record, activation };
  }

  async syncLearningEngine({
    learningEngine,
    skillId,
    name,
    version,
    capabilities: skillCapabilities,
    metadata = {},
    activate = true,
    persist = false,
  } = {}) {
    if (!learningEngine || typeof learningEngine.activeAdapter !== 'function') {
      throw new Error('SKILL_BRIDGE_LEARNING_ENGINE_REQUIRED');
    }
    const activeAdapter = await learningEngine.activeAdapter();
    if (!activeAdapter) return { synced: false, reason: 'NO_ACTIVE_ADAPTER' };
    const result = await this.registerLearningAdapter({
      skillId,
      name,
      version,
      capabilities: skillCapabilities,
      activeAdapter,
      metadata,
      activate,
      persist,
    });
    return { synced: true, ...result };
  }
}
