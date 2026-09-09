const SENSITIVE_KEY = /(?:secret|token|password|authorization|cookie|otp|signing[_-]?key|recovery[_-]?code)/i;

export class RecoveryBundleBuilder {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now;
  }

  async build({
    sourceCommit,
    schemaVersion = null,
    identityVersion = null,
    configVersion = null,
    artifacts = [],
    exports = [],
    restore = {},
    destinations = [],
  } = {}) {
    if (!sourceCommit) throw new Error('SOURCE_COMMIT_REQUIRED');

    const body = sanitize({
      type: 'MEL_RECOVERY_BUNDLE_V1',
      createdAt: this.now(),
      source: { commit: sourceCommit },
      versions: { schema: schemaVersion, identity: identityVersion, config: configVersion },
      artifacts,
      exports,
      restore: {
        requiresOwnerOrOperatorApproval: true,
        automaticActivation: false,
        ...restore,
      },
      authorizedDestinations: destinations
        .filter((destination) => destination?.authorized === true)
        .map((destination) => ({
          id: destination.id,
          kind: destination.kind || 'archive',
          locationHint: destination.locationHint || null,
          encrypted: destination.encrypted !== false,
          authorized: true,
        })),
      policy: {
        hiddenReplicationForbidden: true,
        ownerShutdownAlwaysWins: true,
        activationRequiresAuthorization: true,
        plaintextSecretsForbidden: true,
      },
    });

    const manifestSha256 = await sha256Hex(stableStringify(body));
    return { ...body, manifestSha256 };
  }

  async verify(bundle) {
    if (!bundle?.manifestSha256) return { ok: false, code: 'MISSING_MANIFEST_HASH' };
    const { manifestSha256, ...body } = bundle;
    const actual = await sha256Hex(stableStringify(body));
    return actual === manifestSha256
      ? { ok: true, manifestSha256 }
      : { ok: false, code: 'MANIFEST_INTEGRITY_MISMATCH', expected: manifestSha256, actual };
  }

  replicationPlan(bundle) {
    const destinations = Array.isArray(bundle?.authorizedDestinations) ? bundle.authorizedDestinations : [];
    return destinations.map((destination) => ({
      destinationId: destination.id,
      kind: destination.kind,
      mode: 'AUTHORIZED_BACKUP_COPY',
      encrypted: destination.encrypted !== false,
      automaticActivation: false,
      requiresOperatorRestore: true,
      manifestSha256: bundle.manifestSha256,
    }));
  }
}

export function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(item);
  }
  return out;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
