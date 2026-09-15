export const PORTABILITY_SCHEMA = 'mel.provider-neutral-bundle.v1';

const SECRET_KEY = /(api[_-]?key|token|secret|password|authorization|cookie|credential)/i;
const PROVIDER_LOCK_KEY = /^(required_)?(provider|vendor|account)(_id)?$/i;

const asString = value => String(value ?? '').trim();
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uniqueSorted = values => [...new Set(values)].sort((a, b) => a.localeCompare(b));

function normalizeContract(contract = {}) {
  return {
    id: asString(contract.id),
    version: asString(contract.version || '1'),
    required: contract.required !== false,
    description: asString(contract.description),
  };
}

function normalizeArtifact(artifact = {}) {
  return {
    id: asString(artifact.id),
    contract_id: asString(artifact.contract_id),
    format: asString(artifact.format),
    ref: asString(artifact.ref),
    checksum: asString(artifact.checksum),
  };
}

function normalizeAdapter(adapter = {}) {
  return {
    id: asString(adapter.id),
    contract_id: asString(adapter.contract_id),
    provider: asString(adapter.provider),
    optional: adapter.optional !== false,
  };
}

function findSensitivePaths(value, path = '$', issues = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findSensitivePaths(entry, `${path}[${index}]`, issues));
    return issues;
  }
  if (!isObject(value)) return issues;

  for (const [key, entry] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (SECRET_KEY.test(key)) issues.push({ type: 'SECRET_FIELD_FORBIDDEN', path: next });
    if (isObject(entry) || Array.isArray(entry)) findSensitivePaths(entry, next, issues);
  }
  return issues;
}

function findProviderLocks(value, path = '$', issues = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findProviderLocks(entry, `${path}[${index}]`, issues));
    return issues;
  }
  if (!isObject(value)) return issues;

  for (const [key, entry] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (PROVIDER_LOCK_KEY.test(key) && asString(entry)) {
      issues.push({ type: 'PROVIDER_LOCK_FORBIDDEN', path: next });
    }
    if (isObject(entry) || Array.isArray(entry)) findProviderLocks(entry, next, issues);
  }
  return issues;
}

/**
 * Build the portable description of a MEL system bundle.
 *
 * The manifest records logical contracts and exportable artifacts separately
 * from optional provider adapters. Provider-specific adapters may be listed for
 * migration convenience, but a contract can never require one provider.
 * Secrets are deliberately excluded from this format.
 */
export function createProviderNeutralManifest({
  generated_at = new Date().toISOString(),
  source = {},
  contracts = [],
  artifacts = [],
  adapters = [],
  metadata = {},
} = {}) {
  const normalizedContracts = contracts
    .map(normalizeContract)
    .sort((a, b) => a.id.localeCompare(b.id));
  const normalizedArtifacts = artifacts
    .map(normalizeArtifact)
    .sort((a, b) => a.id.localeCompare(b.id));
  const normalizedAdapters = adapters
    .map(normalizeAdapter)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    schema: PORTABILITY_SCHEMA,
    generated_at: asString(generated_at),
    source: {
      branch: asString(source.branch),
      commit: asString(source.commit),
    },
    contracts: normalizedContracts,
    artifacts: normalizedArtifacts,
    adapters: normalizedAdapters,
    metadata: isObject(metadata) ? metadata : {},
  };
}

export function validateProviderNeutralManifest(manifest) {
  const issues = [];
  if (!isObject(manifest)) return { ok: false, issues: [{ type: 'MANIFEST_NOT_OBJECT', path: '$' }] };

  if (manifest.schema !== PORTABILITY_SCHEMA) {
    issues.push({ type: 'INVALID_SCHEMA', path: '$.schema', expected: PORTABILITY_SCHEMA });
  }

  if (!Number.isFinite(Date.parse(asString(manifest.generated_at)))) {
    issues.push({ type: 'INVALID_GENERATED_AT', path: '$.generated_at' });
  }

  const contracts = Array.isArray(manifest.contracts) ? manifest.contracts : [];
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const adapters = Array.isArray(manifest.adapters) ? manifest.adapters : [];

  if (!Array.isArray(manifest.contracts)) issues.push({ type: 'CONTRACTS_NOT_ARRAY', path: '$.contracts' });
  if (!Array.isArray(manifest.artifacts)) issues.push({ type: 'ARTIFACTS_NOT_ARRAY', path: '$.artifacts' });
  if (!Array.isArray(manifest.adapters)) issues.push({ type: 'ADAPTERS_NOT_ARRAY', path: '$.adapters' });

  const contractIds = contracts.map(row => asString(row?.id)).filter(Boolean);
  if (contractIds.length !== contracts.length) issues.push({ type: 'EMPTY_CONTRACT_ID', path: '$.contracts' });
  if (uniqueSorted(contractIds).length !== contractIds.length) issues.push({ type: 'DUPLICATE_CONTRACT_ID', path: '$.contracts' });

  const knownContracts = new Set(contractIds);
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index] || {};
    const id = asString(artifact.id);
    const contractId = asString(artifact.contract_id);
    if (!id) issues.push({ type: 'EMPTY_ARTIFACT_ID', path: `$.artifacts[${index}].id` });
    if (!contractId || !knownContracts.has(contractId)) {
      issues.push({ type: 'UNKNOWN_ARTIFACT_CONTRACT', path: `$.artifacts[${index}].contract_id`, contract_id: contractId });
    }
    if (!asString(artifact.format)) issues.push({ type: 'EMPTY_ARTIFACT_FORMAT', path: `$.artifacts[${index}].format` });
    if (!asString(artifact.ref)) issues.push({ type: 'EMPTY_ARTIFACT_REF', path: `$.artifacts[${index}].ref` });
  }

  const artifactIds = artifacts.map(row => asString(row?.id)).filter(Boolean);
  if (uniqueSorted(artifactIds).length !== artifactIds.length) issues.push({ type: 'DUPLICATE_ARTIFACT_ID', path: '$.artifacts' });

  const adapterIds = adapters.map(row => asString(row?.id)).filter(Boolean);
  if (adapterIds.length !== adapters.length) issues.push({ type: 'EMPTY_ADAPTER_ID', path: '$.adapters' });
  if (uniqueSorted(adapterIds).length !== adapterIds.length) issues.push({ type: 'DUPLICATE_ADAPTER_ID', path: '$.adapters' });

  for (let index = 0; index < adapters.length; index += 1) {
    const adapter = adapters[index] || {};
    const contractId = asString(adapter.contract_id);
    if (!contractId || !knownContracts.has(contractId)) {
      issues.push({ type: 'UNKNOWN_ADAPTER_CONTRACT', path: `$.adapters[${index}].contract_id`, contract_id: contractId });
    }
    if (adapter.optional !== true) {
      issues.push({ type: 'PROVIDER_ADAPTER_MUST_BE_OPTIONAL', path: `$.adapters[${index}].optional` });
    }
  }

  findSensitivePaths(manifest, '$', issues);
  for (let index = 0; index < contracts.length; index += 1) {
    findProviderLocks(contracts[index], `$.contracts[${index}]`, issues);
  }
  for (let index = 0; index < artifacts.length; index += 1) {
    findProviderLocks(artifacts[index], `$.artifacts[${index}]`, issues);
  }

  return { ok: issues.length === 0, issues };
}

export function portabilitySummary(manifest) {
  const validation = validateProviderNeutralManifest(manifest);
  const contracts = Array.isArray(manifest?.contracts) ? manifest.contracts : [];
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const adapters = Array.isArray(manifest?.adapters) ? manifest.adapters : [];
  return {
    ok: validation.ok,
    schema: manifest?.schema || null,
    contracts: contracts.length,
    required_contracts: contracts.filter(row => row?.required !== false).length,
    artifacts: artifacts.length,
    optional_adapters: adapters.filter(row => row?.optional === true).length,
    providers: uniqueSorted(adapters.map(row => asString(row?.provider)).filter(Boolean)),
    issues: validation.issues,
  };
}
