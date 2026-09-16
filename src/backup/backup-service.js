import { DomainError, port, requireValue } from '../core/contracts.js';
import { sanitize, stableStringify } from '../resilience/recovery-bundle.js';

export const methods = ['create', 'verify', 'list'];
export const VERIFIED_SNAPSHOT_SCHEMA = 'MEL_VERIFIED_SNAPSHOT_V1';

/**
 * Historical adapter-only port kept for compatibility.
 * Unimplemented methods still fail closed through the shared port contract.
 */
export const createBackupService = adapters => port('backup/backup-service', methods, adapters);

/**
 * GEN2-47 verified snapshot service.
 *
 * All system exporters and storage are injected. The service performs no hidden
 * network/storage side effects and writes only after the complete snapshot has
 * passed its own integrity verification.
 */
export function createVerifiedBackupService({ sources = {}, storage, now = () => new Date().toISOString() } = {}) {
  const sourceEntries = Object.entries(sources)
    .filter(([, exporter]) => typeof exporter === 'function')
    .sort(([left], [right]) => left.localeCompare(right));

  requireValue(sourceEntries.length > 0, 'BACKUP_SOURCES_REQUIRED');
  requireValue(storage && typeof storage.put === 'function', 'BACKUP_STORAGE_PUT_REQUIRED');
  requireValue(typeof storage.get === 'function', 'BACKUP_STORAGE_GET_REQUIRED');

  const adapters = {
    async create(input = {}, context = {}) {
      const createdAt = normalizeTimestamp(input.createdAt || now());
      const exported = {};

      // Collect everything before persisting: one failed exporter must not leave
      // a partial snapshot that looks recoverable.
      for (const [name, exporter] of sourceEntries) {
        exported[name] = sanitize(await exporter(input, context));
      }

      const entries = [];
      for (const [name, payload] of Object.entries(exported)) {
        const canonical = stableStringify(payload);
        entries.push({
          name,
          sha256: await sha256Hex(canonical),
          bytes: new TextEncoder().encode(canonical).byteLength,
        });
      }

      const body = {
        schema: VERIFIED_SNAPSHOT_SCHEMA,
        createdAt,
        sourceCount: entries.length,
        entries,
        exports: exported,
        policy: {
          plaintextSecretsForbidden: true,
          verificationRequiredBeforePersist: true,
          partialSnapshotsForbidden: true,
        },
      };
      const integritySha256 = await sha256Hex(stableStringify(body));
      const id = String(input.id || `snapshot-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${integritySha256.slice(0, 12)}`);
      const snapshot = { id, ...body, integritySha256 };
      const verification = await verifySnapshot(snapshot);

      if (!verification.ok) {
        throw new DomainError(`BACKUP_SELF_VERIFICATION_FAILED:${verification.code}`, 500);
      }

      await storage.put(snapshot, context);
      return {
        id,
        schema: VERIFIED_SNAPSHOT_SCHEMA,
        createdAt,
        sourceCount: entries.length,
        integritySha256,
        verified: true,
      };
    },

    async verify(input = {}, context = {}) {
      const snapshot = input.snapshot || (input.id ? await storage.get(String(input.id), context) : null);
      if (!snapshot) return { ok: false, code: 'SNAPSHOT_NOT_FOUND' };
      return verifySnapshot(snapshot);
    },

    async list(input = {}, context = {}) {
      if (typeof storage.list !== 'function') {
        throw new DomainError('NOT_IMPLEMENTED:backup/backup-service.list');
      }
      return storage.list(input, context);
    },
  };

  return createBackupService(adapters);
}

export async function verifySnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== VERIFIED_SNAPSHOT_SCHEMA) {
    return { ok: false, code: 'SNAPSHOT_SCHEMA_INVALID' };
  }
  if (!snapshot.id || !snapshot.integritySha256 || !Array.isArray(snapshot.entries) || !snapshot.exports) {
    return { ok: false, code: 'SNAPSHOT_MANIFEST_INCOMPLETE' };
  }
  if (snapshot.sourceCount !== snapshot.entries.length) {
    return { ok: false, code: 'SNAPSHOT_SOURCE_COUNT_MISMATCH' };
  }

  const entryNames = snapshot.entries.map(entry => entry?.name);
  const exportNames = Object.keys(snapshot.exports).sort();
  if (entryNames.some(name => typeof name !== 'string') || !sameArray(entryNames, exportNames)) {
    return { ok: false, code: 'SNAPSHOT_SOURCE_SET_MISMATCH' };
  }

  for (const entry of snapshot.entries) {
    const canonical = stableStringify(snapshot.exports[entry.name]);
    const actual = await sha256Hex(canonical);
    const bytes = new TextEncoder().encode(canonical).byteLength;
    if (actual !== entry.sha256 || bytes !== entry.bytes) {
      return {
        ok: false,
        code: 'SNAPSHOT_ENTRY_INTEGRITY_MISMATCH',
        source: entry.name,
        expected: entry.sha256,
        actual,
      };
    }
  }

  const { id, integritySha256, ...body } = snapshot;
  const actual = await sha256Hex(stableStringify(body));
  if (actual !== integritySha256) {
    return { ok: false, code: 'SNAPSHOT_INTEGRITY_MISMATCH', expected: integritySha256, actual };
  }

  return { ok: true, id, integritySha256, sourceCount: snapshot.sourceCount };
}

function normalizeTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new DomainError('BACKUP_CREATED_AT_INVALID', 400);
  return date.toISOString();
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
