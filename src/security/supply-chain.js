const SCHEMA = 'mel.security.runtime-sbom/v1';
const DEFAULT_REGISTRY_HOSTS = Object.freeze(['registry.npmjs.org']);
const SEVERITIES = Object.freeze(['low', 'moderate', 'high', 'critical']);

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function nonNegativeInteger(value, code) {
  if (!Number.isInteger(value) || value < 0) throw new Error(code);
  return value;
}

function packageNameFromPath(path) {
  const marker = 'node_modules/';
  const index = path.lastIndexOf(marker);
  if (index < 0) return null;
  const tail = path.slice(index + marker.length);
  const parts = tail.split('/');
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1] || ''}` : parts[0];
}

function resolveDependencyPath(packages, parentPath, dependencyName) {
  let cursor = parentPath;
  while (cursor) {
    const nested = `${cursor}/node_modules/${dependencyName}`;
    if (packages[nested]) return nested;
    const index = cursor.lastIndexOf('/node_modules/');
    cursor = index >= 0 ? cursor.slice(0, index) : '';
  }
  const root = `node_modules/${dependencyName}`;
  return packages[root] ? root : null;
}

function normalizeSource(resolved, allowedRegistryHosts) {
  const value = required(resolved, 'SUPPLY_CHAIN_RESOLVED_REQUIRED');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SUPPLY_CHAIN_RESOLVED_INVALID');
  }
  if (url.protocol !== 'https:') throw new Error('SUPPLY_CHAIN_SOURCE_NOT_HTTPS');
  if (!allowedRegistryHosts.has(url.hostname)) throw new Error('SUPPLY_CHAIN_REGISTRY_NOT_ALLOWED');
  if (url.username || url.password || url.search || url.hash) throw new Error('SUPPLY_CHAIN_SOURCE_CREDENTIALS_FORBIDDEN');
  return freezeDeep({ host: url.hostname, pathname: url.pathname });
}

function normalizeAuditEvidence(audit) {
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw new Error('SUPPLY_CHAIN_AUDIT_EVIDENCE_REQUIRED');
  }
  if (audit.verified !== true) throw new Error('SUPPLY_CHAIN_AUDIT_NOT_VERIFIED');
  const source = required(audit.source, 'SUPPLY_CHAIN_AUDIT_SOURCE_REQUIRED');
  const vulnerabilities = {};
  for (const severity of SEVERITIES) {
    vulnerabilities[severity] = nonNegativeInteger(audit.vulnerabilities?.[severity] ?? 0, 'SUPPLY_CHAIN_AUDIT_INVALID');
  }
  return freezeDeep({ verified: true, source, vulnerabilities: freezeDeep(vulnerabilities) });
}

function normalizePolicy(policy = {}) {
  const allowedRegistryHosts = policy.allowedRegistryHosts ?? DEFAULT_REGISTRY_HOSTS;
  if (!Array.isArray(allowedRegistryHosts) || allowedRegistryHosts.length === 0) {
    throw new Error('SUPPLY_CHAIN_POLICY_INVALID');
  }
  const hosts = [...new Set(allowedRegistryHosts.map(host => required(host, 'SUPPLY_CHAIN_POLICY_INVALID')))];
  hosts.sort();
  return freezeDeep({
    allowed_registry_hosts: hosts,
    max_high: nonNegativeInteger(policy.maxHigh ?? 0, 'SUPPLY_CHAIN_POLICY_INVALID'),
    max_critical: nonNegativeInteger(policy.maxCritical ?? 0, 'SUPPLY_CHAIN_POLICY_INVALID')
  });
}

function validateManifestPair(packageJson, packageLock) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new Error('SUPPLY_CHAIN_PACKAGE_JSON_INVALID');
  }
  if (!packageLock || typeof packageLock !== 'object' || Array.isArray(packageLock)) {
    throw new Error('SUPPLY_CHAIN_LOCKFILE_INVALID');
  }
  if (packageLock.lockfileVersion !== 3 || !packageLock.packages || typeof packageLock.packages !== 'object') {
    throw new Error('SUPPLY_CHAIN_LOCKFILE_VERSION_UNSUPPORTED');
  }
  const root = packageLock.packages[''];
  if (!root || typeof root !== 'object') throw new Error('SUPPLY_CHAIN_LOCK_ROOT_MISSING');
  if (packageJson.name !== packageLock.name || packageJson.version !== packageLock.version) {
    throw new Error('SUPPLY_CHAIN_ROOT_IDENTITY_MISMATCH');
  }
  const manifestDependencies = packageJson.dependencies || {};
  const lockDependencies = root.dependencies || {};
  const manifestNames = Object.keys(manifestDependencies).sort();
  const lockNames = Object.keys(lockDependencies).sort();
  if (JSON.stringify(manifestNames) !== JSON.stringify(lockNames)) {
    throw new Error('SUPPLY_CHAIN_DIRECT_DEPENDENCY_SET_MISMATCH');
  }
  for (const name of manifestNames) {
    if (manifestDependencies[name] !== lockDependencies[name]) {
      throw new Error('SUPPLY_CHAIN_DIRECT_DEPENDENCY_SPEC_MISMATCH');
    }
  }
  return { root, manifestDependencies };
}

export function buildRuntimeSbom({ packageJson, packageLock, policy = {} }) {
  const normalizedPolicy = normalizePolicy(policy);
  const allowedHosts = new Set(normalizedPolicy.allowed_registry_hosts);
  const { manifestDependencies } = validateManifestPair(packageJson, packageLock);
  const packages = packageLock.packages;
  const queue = Object.keys(manifestDependencies).sort().map(name => ({ name, parentPath: '' }));
  const visited = new Set();
  const components = [];

  while (queue.length) {
    const { name, parentPath } = queue.shift();
    const path = resolveDependencyPath(packages, parentPath, name);
    if (!path) throw new Error('SUPPLY_CHAIN_LOCK_ENTRY_MISSING');
    if (visited.has(path)) continue;
    visited.add(path);

    const entry = packages[path];
    const actualName = packageNameFromPath(path);
    const version = required(entry.version, 'SUPPLY_CHAIN_VERSION_REQUIRED');
    const integrity = required(entry.integrity, 'SUPPLY_CHAIN_INTEGRITY_REQUIRED');
    if (!/^sha(256|384|512)-/i.test(integrity)) throw new Error('SUPPLY_CHAIN_INTEGRITY_INVALID');
    const source = normalizeSource(entry.resolved, allowedHosts);
    const dependencies = { ...(entry.dependencies || {}), ...(entry.optionalDependencies || {}) };
    const dependencyNames = Object.keys(dependencies).sort();

    components.push(freezeDeep({
      name: actualName,
      version,
      path,
      integrity,
      source,
      license: typeof entry.license === 'string' ? entry.license : null,
      direct: Object.prototype.hasOwnProperty.call(manifestDependencies, actualName),
      optional: entry.optional === true,
      dependencies: dependencyNames
    }));

    for (const dependencyName of dependencyNames) {
      queue.push({ name: dependencyName, parentPath: path });
    }
  }

  components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version) || a.path.localeCompare(b.path));
  return freezeDeep({
    schema: SCHEMA,
    root: freezeDeep({ name: packageJson.name, version: packageJson.version }),
    direct_runtime_dependencies: Object.keys(manifestDependencies).sort(),
    component_count: components.length,
    components
  });
}

export function normalizeNpmAuditEvidence(payload, { source = 'npm-audit-runtime-ci' } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('SUPPLY_CHAIN_NPM_AUDIT_INVALID');
  }
  if (payload.error) throw new Error('SUPPLY_CHAIN_NPM_AUDIT_UNVERIFIED');
  const counts = payload.metadata?.vulnerabilities;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    throw new Error('SUPPLY_CHAIN_NPM_AUDIT_UNVERIFIED');
  }

  const vulnerabilities = {};
  for (const severity of SEVERITIES) {
    vulnerabilities[severity] = nonNegativeInteger(
      Number(counts[severity] ?? 0),
      'SUPPLY_CHAIN_NPM_AUDIT_INVALID',
    );
  }

  return normalizeAuditEvidence({
    verified: true,
    source,
    vulnerabilities,
  });
}

export function evaluateRuntimeSupplyChain({ packageJson, packageLock, audit, policy = {} }) {
  const normalizedPolicy = normalizePolicy(policy);
  const sbom = buildRuntimeSbom({ packageJson, packageLock, policy });
  const auditEvidence = normalizeAuditEvidence(audit);
  const blockers = [];
  if (auditEvidence.vulnerabilities.critical > normalizedPolicy.max_critical) {
    blockers.push('SUPPLY_CHAIN_CRITICAL_VULNERABILITIES');
  }
  if (auditEvidence.vulnerabilities.high > normalizedPolicy.max_high) {
    blockers.push('SUPPLY_CHAIN_HIGH_VULNERABILITIES');
  }
  return freezeDeep({
    ok: blockers.length === 0,
    schema: 'mel.security.supply-chain-gate/v1',
    policy: normalizedPolicy,
    audit: auditEvidence,
    sbom,
    blockers: freezeDeep(blockers)
  });
}

export function assertRuntimeSupplyChain(input) {
  const result = evaluateRuntimeSupplyChain(input);
  if (!result.ok) throw new Error(result.blockers[0]);
  return result;
}

export const RUNTIME_SBOM_SCHEMA = SCHEMA;
