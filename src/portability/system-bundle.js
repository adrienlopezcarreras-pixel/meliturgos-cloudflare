import {
  PORTABILITY_SCHEMA,
  createProviderNeutralManifest,
  validateProviderNeutralManifest,
} from './provider-neutral-manifest.js';

export const SYSTEM_BUNDLE_SCHEMA = 'mel.provider-neutral-system-bundle.v1';
export const SYSTEM_BUNDLE_CHECKSUM = 'SHA-256';

const SECRET_KEY = /(api[_-]?key|token|secret|password|authorization|cookie|credential|private[_-]?key|otp)/i;
const MAX_ARTIFACTS = 128;
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

function bundleError(code, status = 400) {
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

function jsonSafe(value, path = '$', issues = []) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw bundleError(`SYSTEM_BUNDLE_NON_FINITE_NUMBER:${path}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonSafe(item, `${path}[${index}]`, issues));
  if (isObject(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (SECRET_KEY.test(key)) {
        issues.push({ type: 'SECRET_FIELD_FORBIDDEN', path: `${path}.${key}` });
        continue;
      }
      const child = value[key];
      if (child === undefined) continue;
      if (typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') {
        throw bundleError(`SYSTEM_BUNDLE_UNSUPPORTED_VALUE:${path}.${key}`);
      }
      output[key] = jsonSafe(child, `${path}.${key}`, issues);
    }
    return output;
  }
  throw bundleError(`SYSTEM_BUNDLE_UNSUPPORTED_VALUE:${path}`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

async function sha256(value) {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeContract(input = {}) {
  const id = text(input.id);
  if (!id) throw bundleError('SYSTEM_BUNDLE_CONTRACT_ID_REQUIRED');
  return {
    id,
    version: text(input.version || '1'),
    required: input.required !== false,
    description: text(input.description),
  };
}

function normalizeComponent(component = {}) {
  if (!isObject(component)) throw bundleError('SYSTEM_BUNDLE_COMPONENT_INVALID');
  const id = text(component.id);
  if (!id || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) throw bundleError('SYSTEM_BUNDLE_COMPONENT_ID_INVALID');
  const contract = normalizeContract(component.contract || {});
  const format = text(component.format || 'application/json');
  if (!format) throw bundleError('SYSTEM_BUNDLE_ARTIFACT_FORMAT_REQUIRED');
  if (typeof component.export !== 'function') throw bundleError('SYSTEM_BUNDLE_EXPORTER_REQUIRED');
  return {
    id,
    contract,
    format,
    ref: text(component.ref || `artifacts/${id}.json`),
    export: component.export,
  };
}

function checksumRef(hex) {
  return `sha256:${hex}`;
}

function artifactPayloadBytes(payload) {
  return new TextEncoder().encode(stableJson(payload));
}

function manifestArtifacts(artifacts) {
  return artifacts.map(row => ({
    id: row.id,
    contract_id: row.contract_id,
    format: row.format,
    ref: row.ref,
    checksum: row.checksum,
  }));
}

function requiredContractCoverage(manifest) {
  const artifactsByContract = new Map();
  for (const artifact of manifest.artifacts || []) {
    const count = artifactsByContract.get(artifact.contract_id) || 0;
    artifactsByContract.set(artifact.contract_id, count + 1);
  }
  return (manifest.contracts || [])
    .filter(contract => contract.required !== false)
    .filter(contract => !artifactsByContract.has(contract.id))
    .map(contract => contract.id);
}

export async function createProviderNeutralSystemBundle({
  generated_at = new Date().toISOString(),
  source = {},
  components = [],
  adapters = [],
  metadata = {},
} = {}) {
  if (!Array.isArray(components)) throw bundleError('SYSTEM_BUNDLE_COMPONENTS_ARRAY_REQUIRED');
  if (components.length < 1 || components.length > MAX_ARTIFACTS) throw bundleError('SYSTEM_BUNDLE_COMPONENT_COUNT_INVALID');

  const normalized = components.map(normalizeComponent);
  const componentIds = normalized.map(row => row.id);
  if (new Set(componentIds).size !== componentIds.length) throw bundleError('SYSTEM_BUNDLE_COMPONENT_ID_DUPLICATE');

  const contractMap = new Map();
  for (const component of normalized) {
    const existing = contractMap.get(component.contract.id);
    if (existing) {
      if (stableJson(existing) !== stableJson(component.contract)) {
        throw bundleError('SYSTEM_BUNDLE_CONTRACT_CONFLICT', 409);
      }
    } else {
      contractMap.set(component.contract.id, component.contract);
    }
  }

  const artifacts = [];
  const secretIssues = [];
  let totalBytes = 0;

  for (const component of normalized.sort((a, b) => a.id.localeCompare(b.id))) {
    const raw = await component.export();
    const payload = jsonSafe(raw, `$.artifacts.${component.id}.payload`, secretIssues);
    const bytes = artifactPayloadBytes(payload);
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw bundleError('SYSTEM_BUNDLE_ARTIFACT_TOO_LARGE', 413);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw bundleError('SYSTEM_BUNDLE_TOO_LARGE', 413);

    artifacts.push(Object.freeze({
      id: component.id,
      contract_id: component.contract.id,
      format: component.format,
      ref: component.ref,
      checksum: checksumRef(await sha256(bytes)),
      size_bytes: bytes.byteLength,
      payload,
    }));
  }

  if (secretIssues.length) {
    const error = bundleError('SYSTEM_BUNDLE_SECRET_FIELDS_FORBIDDEN', 400);
    error.issues = Object.freeze(secretIssues);
    throw error;
  }

  const manifest = createProviderNeutralManifest({
    generated_at,
    source,
    contracts: [...contractMap.values()],
    artifacts: manifestArtifacts(artifacts),
    adapters,
    metadata,
  });
  const validation = validateProviderNeutralManifest(manifest);
  if (!validation.ok) {
    const error = bundleError('SYSTEM_BUNDLE_MANIFEST_INVALID', 400);
    error.issues = validation.issues;
    throw error;
  }

  const missing = requiredContractCoverage(manifest);
  if (missing.length) {
    const error = bundleError('SYSTEM_BUNDLE_REQUIRED_CONTRACT_UNCOVERED', 400);
    error.contracts = missing;
    throw error;
  }

  const manifestDigest = checksumRef(await sha256(stableJson(manifest)));
  const artifactDigestIndex = artifacts.map(row => ({
    id: row.id,
    checksum: row.checksum,
    size_bytes: row.size_bytes,
  }));
  const bundleDigest = checksumRef(await sha256(stableJson({
    schema: SYSTEM_BUNDLE_SCHEMA,
    manifest_sha256: manifestDigest,
    artifacts: artifactDigestIndex,
  })));

  return Object.freeze({
    schema: SYSTEM_BUNDLE_SCHEMA,
    checksum_algorithm: SYSTEM_BUNDLE_CHECKSUM,
    manifest,
    artifacts: Object.freeze(artifacts),
    integrity: Object.freeze({
      manifest_sha256: manifestDigest,
      bundle_sha256: bundleDigest,
      artifact_count: artifacts.length,
      total_bytes: totalBytes,
    }),
  });
}

export async function verifyProviderNeutralSystemBundle(bundle) {
  const issues = [];
  if (!isObject(bundle)) return { ok: false, issues: [{ type: 'BUNDLE_NOT_OBJECT', path: '$' }] };
  if (bundle.schema !== SYSTEM_BUNDLE_SCHEMA) issues.push({ type: 'INVALID_BUNDLE_SCHEMA', path: '$.schema' });
  if (bundle.checksum_algorithm !== SYSTEM_BUNDLE_CHECKSUM) issues.push({ type: 'INVALID_CHECKSUM_ALGORITHM', path: '$.checksum_algorithm' });

  const manifest = bundle.manifest;
  const artifacts = Array.isArray(bundle.artifacts) ? bundle.artifacts : [];
  if (!isObject(manifest)) issues.push({ type: 'MANIFEST_MISSING', path: '$.manifest' });
  if (!Array.isArray(bundle.artifacts)) issues.push({ type: 'ARTIFACTS_NOT_ARRAY', path: '$.artifacts' });
  if (artifacts.length > MAX_ARTIFACTS) issues.push({ type: 'TOO_MANY_ARTIFACTS', path: '$.artifacts' });

  if (isObject(manifest)) {
    const validation = validateProviderNeutralManifest(manifest);
    issues.push(...validation.issues.map(issue => ({ ...issue, path: `$.manifest${issue.path.slice(1)}` })));
    for (const id of requiredContractCoverage(manifest)) {
      issues.push({ type: 'REQUIRED_CONTRACT_UNCOVERED', contract_id: id, path: '$.manifest.contracts' });
    }
  }

  const manifestById = new Map(
    Array.isArray(manifest?.artifacts)
      ? manifest.artifacts.map(row => [text(row?.id), row])
      : []
  );

  let totalBytes = 0;
  const digestIndex = [];
  for (let index = 0; index < artifacts.length; index += 1) {
    const row = artifacts[index];
    const path = `$.artifacts[${index}]`;
    if (!isObject(row)) {
      issues.push({ type: 'ARTIFACT_INVALID', path });
      continue;
    }
    const id = text(row.id);
    const manifestRow = manifestById.get(id);
    if (!id || !manifestRow) {
      issues.push({ type: 'ARTIFACT_MANIFEST_MISMATCH', path });
      continue;
    }

    const secretIssues = [];
    let payload;
    try {
      payload = jsonSafe(row.payload, `${path}.payload`, secretIssues);
    } catch (error) {
      issues.push({ type: 'ARTIFACT_PAYLOAD_INVALID', path: `${path}.payload`, code: error.code || error.message });
      continue;
    }
    issues.push(...secretIssues);

    const bytes = artifactPayloadBytes(payload);
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) issues.push({ type: 'ARTIFACT_TOO_LARGE', path });
    const expectedChecksum = checksumRef(await sha256(bytes));
    if (row.checksum !== expectedChecksum) issues.push({ type: 'ARTIFACT_CHECKSUM_MISMATCH', path: `${path}.checksum` });
    if (manifestRow.checksum !== row.checksum) issues.push({ type: 'MANIFEST_ARTIFACT_CHECKSUM_MISMATCH', path });
    if (manifestRow.contract_id !== row.contract_id) issues.push({ type: 'MANIFEST_ARTIFACT_CONTRACT_MISMATCH', path });
    if (manifestRow.ref !== row.ref) issues.push({ type: 'MANIFEST_ARTIFACT_REF_MISMATCH', path });
    if (manifestRow.format !== row.format) issues.push({ type: 'MANIFEST_ARTIFACT_FORMAT_MISMATCH', path });
    if (Number(row.size_bytes) !== bytes.byteLength) issues.push({ type: 'ARTIFACT_SIZE_MISMATCH', path: `${path}.size_bytes` });

    digestIndex.push({ id, checksum: row.checksum, size_bytes: bytes.byteLength });
  }
  if (totalBytes > MAX_TOTAL_BYTES) issues.push({ type: 'BUNDLE_TOO_LARGE', path: '$.artifacts' });

  if (isObject(manifest) && isObject(bundle.integrity)) {
    const expectedManifest = checksumRef(await sha256(stableJson(manifest)));
    if (bundle.integrity.manifest_sha256 !== expectedManifest) {
      issues.push({ type: 'MANIFEST_CHECKSUM_MISMATCH', path: '$.integrity.manifest_sha256' });
    }
    digestIndex.sort((a, b) => a.id.localeCompare(b.id));
    const expectedBundle = checksumRef(await sha256(stableJson({
      schema: SYSTEM_BUNDLE_SCHEMA,
      manifest_sha256: expectedManifest,
      artifacts: digestIndex,
    })));
    if (bundle.integrity.bundle_sha256 !== expectedBundle) {
      issues.push({ type: 'BUNDLE_CHECKSUM_MISMATCH', path: '$.integrity.bundle_sha256' });
    }
    if (Number(bundle.integrity.artifact_count) !== artifacts.length) {
      issues.push({ type: 'ARTIFACT_COUNT_MISMATCH', path: '$.integrity.artifact_count' });
    }
    if (Number(bundle.integrity.total_bytes) !== totalBytes) {
      issues.push({ type: 'TOTAL_BYTES_MISMATCH', path: '$.integrity.total_bytes' });
    }
  } else {
    issues.push({ type: 'INTEGRITY_MISSING', path: '$.integrity' });
  }

  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
    summary: Object.freeze({
      artifacts: artifacts.length,
      total_bytes: totalBytes,
      manifest_schema: manifest?.schema || null,
      bundle_schema: bundle?.schema || null,
    }),
  });
}

export function serializeProviderNeutralSystemBundle(bundle, { pretty = true } = {}) {
  return JSON.stringify(jsonSafe(bundle), null, pretty ? 2 : 0);
}

export async function parseProviderNeutralSystemBundle(value) {
  if (typeof value !== 'string' || !value.trim()) throw bundleError('SYSTEM_BUNDLE_TEXT_REQUIRED');
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw bundleError('SYSTEM_BUNDLE_JSON_INVALID');
  }
  const verification = await verifyProviderNeutralSystemBundle(parsed);
  if (!verification.ok) {
    const error = bundleError('SYSTEM_BUNDLE_VERIFICATION_FAILED');
    error.issues = verification.issues;
    throw error;
  }
  return parsed;
}

export function portabilityRuntimeDescriptor(bundle) {
  const verification = bundle && typeof bundle === 'object'
    ? {
        schema: bundle.schema || null,
        manifest_schema: bundle.manifest?.schema || null,
        artifact_count: Array.isArray(bundle.artifacts) ? bundle.artifacts.length : 0,
        required_contracts: Array.isArray(bundle.manifest?.contracts)
          ? bundle.manifest.contracts.filter(row => row?.required !== false).map(row => row.id).sort()
          : [],
        optional_providers: Array.isArray(bundle.manifest?.adapters)
          ? [...new Set(bundle.manifest.adapters.filter(row => row?.optional === true).map(row => text(row.provider)).filter(Boolean))].sort()
          : [],
      }
    : {};
  return Object.freeze(verification);
}

export { PORTABILITY_SCHEMA };
