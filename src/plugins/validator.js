import { requireValue } from '../core/contracts.js';

export const MANIFEST_FIELDS = Object.freeze([
  'id','name','version','description','author','capabilities','permissions',
  'secrets_required','dependencies','entrypoint','healthcheck','risk'
]);

const CAPABILITY_ID = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,127}$/;
const PERMISSION_ID = /^(?:\\*|[a-zA-Z][a-zA-Z0-9_.:-]{0,127})$/;
const SECRET_ID = /^[A-Z][A-Z0-9_]*$/;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value, code, max) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, code, 400);
  requireValue(!/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/.test(value), code, 400);
  return value.trim();
}

function stringArray(value, code, { pattern = null, maxItems = 128, maxLength = 200 } = {}) {
  requireValue(Array.isArray(value) && value.length <= maxItems, code, 400);
  const normalized = value.map(item => {
    requireValue(typeof item === 'string' && item.trim().length > 0 && item.length <= maxLength, code, 400);
    const trimmed = item.trim();
    requireValue(!pattern || pattern.test(trimmed), code, 400);
    return trimmed;
  });
  requireValue(new Set(normalized).size === normalized.length, code + '_DUPLICATE', 400);
  return normalized;
}

export function validateManifest(manifest, kind = 'plugin') {
  requireValue(plainObject(manifest), 'INVALID_MANIFEST', 400);
  for (const field of MANIFEST_FIELDS.filter(f => kind !== 'module' || f !== 'healthcheck')) {
    requireValue(manifest[field] !== undefined, 'MANIFEST_FIELD_REQUIRED', 400);
  }

  requireValue(typeof manifest.id === 'string' && /^[a-z][a-z0-9.-]{1,100}$/.test(manifest.id), 'INVALID_ID', 400);
  requireValue(typeof manifest.version === 'string' && /^\\d+\\.\\d+\\.\\d+$/.test(manifest.version), 'INVALID_VERSION', 400);
  requireValue(['LOW','MEDIUM','HIGH'].includes(manifest.risk), 'INVALID_RISK', 400);

  const normalized = structuredClone(manifest);
  normalized.id = manifest.id.trim();
  normalized.version = manifest.version.trim();
  normalized.name = boundedText(manifest.name, 'INVALID_NAME', 200);
  normalized.description = boundedText(manifest.description, 'INVALID_DESCRIPTION', 4000);
  normalized.author = boundedText(manifest.author, 'INVALID_AUTHOR', 300);

  normalized.entrypoint = boundedText(manifest.entrypoint, 'INVALID_ENTRYPOINT', 500);
  requireValue(
    /^[a-zA-Z0-9_./-]+\\.m?js$/.test(normalized.entrypoint)
      && !normalized.entrypoint.startsWith('/')
      && !normalized.entrypoint.split('/').includes('..'),
    'INVALID_ENTRYPOINT',
    400,
  );

  if (kind !== 'module' || manifest.healthcheck !== undefined) {
    normalized.healthcheck = boundedText(manifest.healthcheck, 'INVALID_HEALTHCHECK', 500);
  }

  normalized.capabilities = stringArray(manifest.capabilities, 'INVALID_CAPABILITY', {
    pattern: CAPABILITY_ID,
    maxItems: 128,
    maxLength: 128,
  });
  requireValue(normalized.capabilities.length > 0, 'PLUGIN_CAPABILITIES_REQUIRED', 400);

  normalized.permissions = stringArray(manifest.permissions, 'INVALID_PERMISSION', {
    pattern: PERMISSION_ID,
    maxItems: 128,
    maxLength: 128,
  });
  normalized.secrets_required = stringArray(manifest.secrets_required, 'INVALID_SECRET_REFERENCE', {
    pattern: SECRET_ID,
    maxItems: 64,
    maxLength: 128,
  });
  normalized.dependencies = stringArray(manifest.dependencies, 'INVALID_DEPENDENCY', {
    maxItems: 128,
    maxLength: 200,
  });

  if (normalized.permissions.includes('*') || normalized.secrets_required.length > 0) {
    requireValue(normalized.risk !== 'LOW', 'PLUGIN_RISK_UNDERDECLARED', 400);
  }

  return normalized;
}