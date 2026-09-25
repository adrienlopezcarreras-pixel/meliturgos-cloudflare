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

export const MEMORY_SNAPSHOT_SCHEMA_VERSION = '1.0.0';

function sortSnapshotRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => jsonSafe(row))
    .sort((a, b) => {
      const aId = String(a?.id ?? a?.conversation_id ?? a?.message_id ?? '');
      const bId = String(b?.id ?? b?.conversation_id ?? b?.message_id ?? '');
      if (aId !== bId) return aId.localeCompare(bId);
      const aTime = Number(a?.created_at ?? a?.timestamp ?? a?.updated_at ?? 0);
      const bTime = Number(b?.created_at ?? b?.timestamp ?? b?.updated_at ?? 0);
      if (aTime !== bTime) return aTime - bTime;
      return stableJson(a).localeCompare(stableJson(b));
    });
}

export async function createPortableMemorySnapshot({
  owner = '',
  memories = [],
  conversations = [],
  archive_messages = [],
  source_counts = {},
  db_schema_version = null,
  exportedAt = new Date().toISOString(),
} = {}) {
  const generated = new Date(exportedAt);
  if (Number.isNaN(generated.getTime())) throw exportError('MEMORY_EXPORT_GENERATED_AT_INVALID');

  const collections = {
    memories: sortSnapshotRows(memories),
    conversations: sortSnapshotRows(conversations),
    archive_messages: sortSnapshotRows(archive_messages),
  };

  const manifestCollections = [];
  for (const [name, rows] of Object.entries(collections)) {
    const sourceCountRaw = Number(source_counts?.[name]);
    const sourceCount = Number.isFinite(sourceCountRaw) && sourceCountRaw >= 0
      ? Math.trunc(sourceCountRaw)
      : rows.length;
    manifestCollections.push(Object.freeze({
      name,
      source_count: sourceCount,
      exported_count: rows.length,
      complete: sourceCount === rows.length,
      sha256: await sha256(stableJson(rows)),
    }));
  }

  const totalSource = manifestCollections.reduce((sum, row) => sum + row.source_count, 0);
  const totalExported = manifestCollections.reduce((sum, row) => sum + row.exported_count, 0);
  const manifestCore = {
    schema_version: MEMORY_SNAPSHOT_SCHEMA_VERSION,
    db_schema_version: Number.isFinite(Number(db_schema_version)) ? Number(db_schema_version) : null,
    checksum_algorithm: MEMORY_EXPORT_CHECKSUM_ALGORITHM,
    owner: String(owner || ''),
    total_source_records: totalSource,
    total_exported_records: totalExported,
    complete: manifestCollections.every(row => row.complete),
    collections: manifestCollections,
  };

  return Object.freeze({
    format: MEMORY_EXPORT_FORMAT,
    version: 1,
    schema_version: MEMORY_SNAPSHOT_SCHEMA_VERSION,
    exported_at: generated.toISOString(),
    owner: String(owner || ''),
    manifest: Object.freeze({
      ...manifestCore,
      export_sha256: await sha256(stableJson(manifestCore)),
    }),
    memories: Object.freeze(collections.memories),
    conversations: Object.freeze(collections.conversations),
    archive_messages: Object.freeze(collections.archive_messages),
  });
}

export async function verifyPortableMemorySnapshot(snapshot) {
  const failures = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return Object.freeze({ ok: false, failures: Object.freeze(['SNAPSHOT_INVALID']) });
  }
  if (snapshot.format !== MEMORY_EXPORT_FORMAT) failures.push('FORMAT_UNSUPPORTED');
  if (snapshot.schema_version !== MEMORY_SNAPSHOT_SCHEMA_VERSION) failures.push('SCHEMA_VERSION_UNSUPPORTED');
  if (snapshot?.manifest?.checksum_algorithm !== MEMORY_EXPORT_CHECKSUM_ALGORITHM) failures.push('CHECKSUM_ALGORITHM_UNSUPPORTED');

  const manifestRows = Array.isArray(snapshot?.manifest?.collections) ? snapshot.manifest.collections : [];
  const manifestByName = new Map(manifestRows.map(row => [String(row?.name || ''), row]));
  const expectedNames = ['memories', 'conversations', 'archive_messages'];

  for (const name of expectedNames) {
    const expected = manifestByName.get(name);
    if (!expected) {
      failures.push(`COLLECTION_${name}_MANIFEST_MISSING`);
      continue;
    }
    const rows = sortSnapshotRows(snapshot[name]);
    const actualChecksum = await sha256(stableJson(rows));
    if (String(expected.sha256 || '') !== actualChecksum) failures.push(`COLLECTION_${name}_CHECKSUM_MISMATCH`);
    if (Number(expected.exported_count) !== rows.length) failures.push(`COLLECTION_${name}_COUNT_MISMATCH`);
    const sourceCount = Number(expected.source_count);
    if (!Number.isInteger(sourceCount) || sourceCount < rows.length) failures.push(`COLLECTION_${name}_SOURCE_COUNT_INVALID`);
    if (Boolean(expected.complete) !== (sourceCount === rows.length)) failures.push(`COLLECTION_${name}_COMPLETENESS_MISMATCH`);
  }

  const manifestCore = {
    schema_version: String(snapshot?.manifest?.schema_version || ''),
    db_schema_version: snapshot?.manifest?.db_schema_version == null ? null : Number(snapshot.manifest.db_schema_version),
    checksum_algorithm: String(snapshot?.manifest?.checksum_algorithm || ''),
    owner: String(snapshot?.manifest?.owner || ''),
    total_source_records: Number(snapshot?.manifest?.total_source_records || 0),
    total_exported_records: Number(snapshot?.manifest?.total_exported_records || 0),
    complete: Boolean(snapshot?.manifest?.complete),
    collections: manifestRows.map(row => ({
      name: String(row?.name || ''),
      source_count: Number(row?.source_count || 0),
      exported_count: Number(row?.exported_count || 0),
      complete: Boolean(row?.complete),
      sha256: String(row?.sha256 || ''),
    })),
  };
  const expectedExportChecksum = await sha256(stableJson(manifestCore));
  if (String(snapshot?.manifest?.export_sha256 || '') !== expectedExportChecksum) failures.push('EXPORT_CHECKSUM_MISMATCH');

  const sourceTotal = manifestRows.reduce((sum, row) => sum + Number(row?.source_count || 0), 0);
  const exportedTotal = manifestRows.reduce((sum, row) => sum + Number(row?.exported_count || 0), 0);
  if (Number(snapshot?.manifest?.total_source_records) !== sourceTotal) failures.push('TOTAL_SOURCE_COUNT_MISMATCH');
  if (Number(snapshot?.manifest?.total_exported_records) !== exportedTotal) failures.push('TOTAL_EXPORTED_COUNT_MISMATCH');
  if (Boolean(snapshot?.manifest?.complete) !== manifestRows.every(row => row?.complete === true)) failures.push('EXPORT_COMPLETENESS_MISMATCH');

  return Object.freeze({
    ok: failures.length === 0,
    complete: failures.length === 0 && snapshot?.manifest?.complete === true,
    schema_version: snapshot.schema_version || null,
    db_schema_version: snapshot?.manifest?.db_schema_version ?? null,
    total_records: exportedTotal,
    failures: Object.freeze(failures),
  });
}
