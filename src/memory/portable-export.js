export const MEMORY_EXPORT_FORMAT = 'meliturgos-memory-export';
export const MEMORY_EXPORT_SCHEMA_VERSION = '1.0.0';
export const MEMORY_EXPORT_CHECKSUM_ALGORITHM = 'SHA-256';
const MAX_RECORDS = 100000;

function exportError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function jsonSafe(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw exportError(`MEMORY_EXPORT_NON_FINITE_NUMBER:${path}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonSafe(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) continue;
      if (typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') {
        throw exportError(`MEMORY_EXPORT_UNSUPPORTED_VALUE:${path}.${key}`);
      }
      output[key] = jsonSafe(child, `${path}.${key}`);
    }
    return output;
  }
  throw exportError(`MEMORY_EXPORT_UNSUPPORTED_VALUE:${path}`);
}

export function stableJson(value) {
  return JSON.stringify(jsonSafe(value));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizePortableMemoryRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw exportError('MEMORY_EXPORT_RECORD_INVALID');
  if (typeof record.id !== 'string' || !record.id.trim()) throw exportError('MEMORY_EXPORT_RECORD_ID_REQUIRED');
  if (typeof record.content !== 'string' || !record.content.trim()) throw exportError('MEMORY_EXPORT_RECORD_CONTENT_REQUIRED');

  // Keep every JSON-safe field so exports remain forward-compatible with
  // memory schema evolution, while normalizing the two portable identifiers.
  const normalized = jsonSafe(record);
  normalized.id = record.id.trim();
  normalized.content = record.content;
  return Object.freeze(normalized);
}

export async function createPortableMemoryExport(records, {
  generatedAt = new Date().toISOString(),
  source = 'meliturgos',
} = {}) {
  if (!Array.isArray(records)) throw exportError('MEMORY_EXPORT_RECORDS_ARRAY_REQUIRED');
  if (records.length > MAX_RECORDS) throw exportError('MEMORY_EXPORT_TOO_MANY_RECORDS');
  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) throw exportError('MEMORY_EXPORT_GENERATED_AT_INVALID');

  const normalized = records.map(normalizePortableMemoryRecord);
  normalized.sort((a, b) => a.id.localeCompare(b.id));

  const entries = [];
  for (const memory of normalized) {
    entries.push(Object.freeze({
      memory,
      checksum: Object.freeze({
        algorithm: MEMORY_EXPORT_CHECKSUM_ALGORITHM,
        value: await sha256(stableJson(memory)),
      }),
    }));
  }

  const payloadSha256 = await sha256(stableJson(normalized));
  return Object.freeze({
    manifest: Object.freeze({
      format: MEMORY_EXPORT_FORMAT,
      schema_version: MEMORY_EXPORT_SCHEMA_VERSION,
      generated_at: generated.toISOString(),
      source: String(source || 'meliturgos').slice(0, 120),
      record_count: entries.length,
      checksum_algorithm: MEMORY_EXPORT_CHECKSUM_ALGORITHM,
      payload_sha256: payloadSha256,
    }),
    records: Object.freeze(entries),
  });
}

export async function verifyPortableMemoryExport(bundle) {
  const failures = [];
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    return { ok: false, failures: ['BUNDLE_INVALID'] };
  }
  const manifest = bundle.manifest;
  const entries = bundle.records;
  if (!manifest || typeof manifest !== 'object') failures.push('MANIFEST_MISSING');
  if (!Array.isArray(entries)) failures.push('RECORDS_MISSING');
  if (failures.length) return { ok: false, failures };

  if (manifest.format !== MEMORY_EXPORT_FORMAT) failures.push('FORMAT_UNSUPPORTED');
  if (manifest.schema_version !== MEMORY_EXPORT_SCHEMA_VERSION) failures.push('SCHEMA_VERSION_UNSUPPORTED');
  if (manifest.checksum_algorithm !== MEMORY_EXPORT_CHECKSUM_ALGORITHM) failures.push('CHECKSUM_ALGORITHM_UNSUPPORTED');
  if (manifest.record_count !== entries.length) failures.push('RECORD_COUNT_MISMATCH');
  if (entries.length > MAX_RECORDS) failures.push('TOO_MANY_RECORDS');

  const memories = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    try {
      const memory = normalizePortableMemoryRecord(entry?.memory);
      memories.push(memory);
      const expected = await sha256(stableJson(memory));
      if (entry?.checksum?.algorithm !== MEMORY_EXPORT_CHECKSUM_ALGORITHM) failures.push(`RECORD_${index}_ALGORITHM_MISMATCH`);
      if (entry?.checksum?.value !== expected) failures.push(`RECORD_${index}_CHECKSUM_MISMATCH`);
    } catch (error) {
      failures.push(`RECORD_${index}_INVALID:${error?.code || error?.message || 'UNKNOWN'}`);
    }
  }

  if (memories.length === entries.length) {
    memories.sort((a, b) => a.id.localeCompare(b.id));
    const expectedPayload = await sha256(stableJson(memories));
    if (manifest.payload_sha256 !== expectedPayload) failures.push('PAYLOAD_CHECKSUM_MISMATCH');
  }

  return Object.freeze({ ok: failures.length === 0, failures: Object.freeze(failures) });
}

export function serializePortableMemoryExport(bundle, { pretty = true } = {}) {
  return JSON.stringify(jsonSafe(bundle), null, pretty ? 2 : 0);
}

export async function parsePortableMemoryExport(text) {
  if (typeof text !== 'string' || !text.trim()) throw exportError('MEMORY_EXPORT_TEXT_REQUIRED');
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw exportError('MEMORY_EXPORT_JSON_INVALID');
  }
  const verification = await verifyPortableMemoryExport(bundle);
  if (!verification.ok) {
    const error = exportError('MEMORY_EXPORT_VERIFICATION_FAILED');
    error.failures = verification.failures;
    throw error;
  }
  return bundle;
}
