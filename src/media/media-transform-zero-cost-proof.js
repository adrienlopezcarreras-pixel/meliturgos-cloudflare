export const MEDIA_TRANSFORM_ZERO_COST_PROOF_SCHEMA = 'mel.media-transform.zero-cost-proof/v1';
export const MEDIA_TRANSFORM_ZERO_COST_PROOF_MAX_AGE_MS = 60 * 60 * 1000;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function mediaTransformZeroCostProvenance(env = {}, { now = Date.now() } = {}) {
  const proof = parseObject(env?.MEL_MEDIA_TRANSFORM_ZERO_COST_PROOF_JSON);
  if (!proof) return null;
  if (clean(proof.schema) !== MEDIA_TRANSFORM_ZERO_COST_PROOF_SCHEMA) return null;
  if (clean(proof.provider) !== 'cloudflare-media-transformations') return null;
  if (clean(proof.binding) !== 'MEDIA') return null;
  if (clean(proof.source) !== 'cloudflare-official-bindings-doc') return null;
  if (clean(proof.billing_status) !== 'OPEN_BETA_NOT_BILLED') return null;

  const verifiedAt = timestamp(proof.verified_at);
  const expiresAt = timestamp(proof.expires_at);
  const current = Number(now);
  if (verifiedAt === null || expiresAt === null || !Number.isFinite(current)) return null;
  if (verifiedAt > current + 60_000) return null;
  if (expiresAt <= current || expiresAt <= verifiedAt) return null;
  if (expiresAt - verifiedAt > MEDIA_TRANSFORM_ZERO_COST_PROOF_MAX_AGE_MS) return null;

  return Object.freeze({
    verified: true,
    addedCost: 0,
    source: 'cloudflare-media-transformations-open-beta-proof',
    evidence: Object.freeze({
      authority: 'developers.cloudflare.com',
      binding: 'MEDIA',
      billing_status: 'OPEN_BETA_NOT_BILLED',
      verified_at: new Date(verifiedAt).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      documentation_url: clean(proof.documentation_url),
    }),
  });
}
