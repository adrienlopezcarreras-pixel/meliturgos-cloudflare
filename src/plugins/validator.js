import { requireValue } from '../core/contracts.js';
export const MANIFEST_FIELDS = Object.freeze(['id','name','version','description','author','capabilities','permissions','secrets_required','dependencies','entrypoint','healthcheck','risk']);
export function validateManifest(manifest, kind = 'plugin') {
  requireValue(manifest && typeof manifest === 'object', 'INVALID_MANIFEST');
  for (const field of MANIFEST_FIELDS.filter(f => kind !== 'module' || f !== 'healthcheck')) requireValue(manifest[field] !== undefined, 'MANIFEST_FIELD_REQUIRED');
  requireValue(/^[a-z][a-z0-9.-]{1,100}$/.test(manifest.id), 'INVALID_ID');
  requireValue(/^\d+\.\d+\.\d+$/.test(manifest.version), 'INVALID_VERSION');
  requireValue(['LOW','MEDIUM','HIGH'].includes(manifest.risk), 'INVALID_RISK');
  requireValue(typeof manifest.entrypoint === 'string' && /^[a-zA-Z0-9_./-]+\.m?js$/.test(manifest.entrypoint) && !manifest.entrypoint.startsWith('/') && !manifest.entrypoint.split('/').includes('..'), 'INVALID_ENTRYPOINT');
  for (const field of ['capabilities','permissions','secrets_required','dependencies']) requireValue(Array.isArray(manifest[field]) && manifest[field].every(x => typeof x === 'string'), 'INVALID_MANIFEST_ARRAY');
  requireValue(manifest.secrets_required.every(x => /^[A-Z][A-Z0-9_]*$/.test(x)), 'SECRET_REFERENCE_REQUIRED');
  return structuredClone(manifest);
}
