import {
  buildRuntimeSbom,
  evaluateRuntimeSupplyChain,
} from './supply-chain.js';
import {
  createReleaseManifest,
  verifyReleaseManifest,
} from './release-manifest.js';

export const SUPPLY_CHAIN_ATTESTATION_SCHEMA = 'mel.security.supply-chain-attestation/v1';

function attestationError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function text(value) {
  return String(value ?? '').trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeAudit(audit = {}) {
  const vulnerabilities = {};
  for (const severity of ['low','moderate','high','critical']) {
    const value = Number(audit?.vulnerabilities?.[severity] || 0);
    vulnerabilities[severity] = Number.isInteger(value) && value >= 0 ? value : 0;
  }
  return Object.freeze({
    verified: audit?.verified === true,
    source: text(audit?.source || 'unknown'),
    status: text(audit?.status || (audit?.verified === true ? 'VERIFIED' : 'UNVERIFIED')),
    vulnerabilities: Object.freeze(vulnerabilities),
    note: text(audit?.note || ''),
  });
}

function sourceIdentity(commit, branch) {
  const normalizedCommit = text(commit).toLowerCase();
  const normalizedBranch = text(branch);
  const exact = /^[0-9a-f]{40}$/.test(normalizedCommit);
  return Object.freeze({
    commit: normalizedCommit || 'unknown',
    branch: normalizedBranch || 'unknown',
    exact_sha: exact,
  });
}

function normalizedPolicy(policy = {}) {
  return {
    allowedRegistryHosts: Array.isArray(policy.allowedRegistryHosts)
      ? [...policy.allowedRegistryHosts]
      : undefined,
    maxHigh: policy.maxHigh ?? 0,
    maxCritical: policy.maxCritical ?? 0,
  };
}

function releaseBlockers({ source, audit, gate, ci }) {
  const blockers = [];
  if (!source.exact_sha) blockers.push('SUPPLY_CHAIN_SOURCE_SHA_UNVERIFIED');
  if (ci?.dependency_tree_verified !== true) blockers.push('SUPPLY_CHAIN_DEPENDENCY_TREE_UNVERIFIED');
  if (!audit.verified) blockers.push('SUPPLY_CHAIN_AUDIT_UNVERIFIED');
  for (const blocker of gate?.blockers || []) blockers.push(blocker);
  return [...new Set(blockers)];
}

function unsigned(attestation) {
  const copy = structuredClone(attestation);
  delete copy.integrity;
  return copy;
}

export async function createSupplyChainAttestation({
  commit,
  branch,
  packageJson,
  packageLock,
  packageLockText = null,
  audit = {},
  policy = {},
  generatedAt = new Date().toISOString(),
  schemaVersion = 'unknown',
  configVersion = 'unknown',
  ci = {},
} = {}) {
  if (!packageJson || typeof packageJson !== 'object') throw attestationError('SUPPLY_CHAIN_PACKAGE_JSON_REQUIRED');
  if (!packageLock || typeof packageLock !== 'object') throw attestationError('SUPPLY_CHAIN_LOCKFILE_REQUIRED');
  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) throw attestationError('SUPPLY_CHAIN_ATTESTATION_TIME_INVALID');

  const source = sourceIdentity(commit, branch);
  const normalizedAudit = normalizeAudit(audit);
  const sbom = buildRuntimeSbom({ packageJson, packageLock, policy: normalizedPolicy(policy) });

  let gate = null;
  if (normalizedAudit.verified) {
    gate = evaluateRuntimeSupplyChain({
      packageJson,
      packageLock,
      audit: {
        verified: true,
        source: normalizedAudit.source,
        vulnerabilities: normalizedAudit.vulnerabilities,
      },
      policy: normalizedPolicy(policy),
    });
  } else {
    gate = Object.freeze({
      ok: false,
      schema: 'mel.security.supply-chain-gate/v1',
      blockers: Object.freeze(['SUPPLY_CHAIN_AUDIT_UNVERIFIED']),
      sbom,
      audit: normalizedAudit,
    });
  }

  const sbomSha256 = await sha256(stableJson(sbom));
  const lockfileSha256 = await sha256(
    typeof packageLockText === 'string' ? packageLockText : stableJson(packageLock)
  );

  const normalizedCi = Object.freeze({
    run_id: text(ci.run_id),
    workflow: text(ci.workflow),
    repository: text(ci.repository),
    event: text(ci.event),
    dependency_tree_verified: ci.dependency_tree_verified === true,
  });

  const releaseManifest = await createReleaseManifest({
    commit: source.commit,
    branch: source.branch,
    lockfileHash: lockfileSha256,
    schemaVersion,
    configVersion,
    artifacts: [{
      path: 'runtime-sbom.json',
      sha256: sbomSha256,
    }],
    healthChecks: [
      normalizedAudit.verified ? 'runtime-audit:verified' : 'runtime-audit:unverified',
      gate.ok ? 'runtime-supply-chain:pass' : 'runtime-supply-chain:blocked',
    ],
  });

  const blockers = releaseBlockers({ source, audit: normalizedAudit, gate, ci: normalizedCi });
  const body = {
    schema: SUPPLY_CHAIN_ATTESTATION_SCHEMA,
    generated_at: generated.toISOString(),
    source,
    ci: normalizedCi,
    lockfile: {
      sha256: lockfileSha256,
      lockfile_version: packageLock.lockfileVersion ?? null,
    },
    audit: normalizedAudit,
    policy: gate.policy || null,
    sbom,
    sbom_sha256: sbomSha256,
    gate: {
      ok: blockers.length === 0,
      blockers,
    },
    release_manifest: releaseManifest,
    release_eligible: blockers.length === 0,
  };

  const digest = await sha256(stableJson(body));
  return Object.freeze({
    ...body,
    integrity: Object.freeze({
      algorithm: 'SHA-256',
      attestation_sha256: digest,
      scope: 'attestation_without_integrity',
    }),
  });
}

export async function verifySupplyChainAttestation(attestation, {
  packageLockText = null,
} = {}) {
  const issues = [];
  if (!isObject(attestation)) return { ok:false, issues:['ATTESTATION_INVALID'] };
  if (attestation.schema !== SUPPLY_CHAIN_ATTESTATION_SCHEMA) issues.push('ATTESTATION_SCHEMA_INVALID');

  const supplied = text(attestation?.integrity?.attestation_sha256);
  if (!/^[0-9a-f]{64}$/.test(supplied)) {
    issues.push('ATTESTATION_DIGEST_INVALID');
  } else {
    const expected = await sha256(stableJson(unsigned(attestation)));
    if (supplied !== expected) issues.push('ATTESTATION_DIGEST_MISMATCH');
  }

  const expectedSbom = await sha256(stableJson(attestation.sbom));
  if (text(attestation.sbom_sha256) !== expectedSbom) issues.push('SBOM_DIGEST_MISMATCH');

  if (typeof packageLockText === 'string') {
    const expectedLock = await sha256(packageLockText);
    if (text(attestation?.lockfile?.sha256) !== expectedLock) issues.push('LOCKFILE_DIGEST_MISMATCH');
  }

  const releaseVerification = await verifyReleaseManifest(attestation.release_manifest);
  if (!releaseVerification.ok) issues.push(releaseVerification.code || 'RELEASE_MANIFEST_INVALID');
  if (text(attestation?.release_manifest?.artifacts?.[0]?.sha256) !== expectedSbom) {
    issues.push('RELEASE_MANIFEST_SBOM_MISMATCH');
  }
  if (text(attestation?.release_manifest?.lockfileHash) !== text(attestation?.lockfile?.sha256)) {
    issues.push('RELEASE_MANIFEST_LOCKFILE_MISMATCH');
  }
  if (text(attestation?.release_manifest?.commit) !== text(attestation?.source?.commit)) {
    issues.push('RELEASE_MANIFEST_COMMIT_MISMATCH');
  }
  if (text(attestation?.release_manifest?.branch) !== text(attestation?.source?.branch)) {
    issues.push('RELEASE_MANIFEST_BRANCH_MISMATCH');
  }

  const expectedEligible = attestation?.source?.exact_sha === true
    && attestation?.ci?.dependency_tree_verified === true
    && attestation?.audit?.verified === true
    && Array.isArray(attestation?.gate?.blockers)
    && attestation.gate.blockers.length === 0;
  if (attestation.release_eligible !== expectedEligible) issues.push('RELEASE_ELIGIBILITY_INCONSISTENT');
  if (attestation?.gate?.ok !== expectedEligible) issues.push('GATE_STATE_INCONSISTENT');

  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
    release_eligible: issues.length === 0 && expectedEligible,
    source_commit: text(attestation?.source?.commit) || null,
    sbom_sha256: expectedSbom,
  });
}

export async function assertSupplyChainReleaseEligible(attestation, options = {}) {
  const verification = await verifySupplyChainAttestation(attestation, options);
  if (!verification.ok) throw attestationError(verification.issues[0] || 'SUPPLY_CHAIN_ATTESTATION_INVALID', 409);
  if (!verification.release_eligible) {
    const blocker = attestation?.gate?.blockers?.[0] || 'SUPPLY_CHAIN_RELEASE_NOT_ELIGIBLE';
    throw attestationError(blocker, 409);
  }
  return verification;
}

export function serializeSupplyChainAttestation(attestation, { pretty = true } = {}) {
  return JSON.stringify(stable(attestation), null, pretty ? 2 : 0);
}
