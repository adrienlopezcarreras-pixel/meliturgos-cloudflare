import { createHash } from 'node:crypto';

const token = String(process.env.MEL_GEN2_42_CHALLENGE_TOKEN || '');
const cfToken = String(process.env.CLOUDFLARE_API_TOKEN || '');
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '');
const bucket = String(process.env.MEL_R2_BUCKET || 'meliturgos-private-media');
const scope = 'gen2-42-runtime-tick';
const now = Date.now();
const expiresAt = now + 5 * 60 * 1000;

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

function keyPath(key) {
  return String(key || '').split('/').map(segment => encodeURIComponent(segment)).join('/');
}

assert(token.length >= 32, 'GEN2_42_CHALLENGE_TOKEN_REQUIRED');
assert(cfToken.length >= 20, 'CLOUDFLARE_API_TOKEN_REQUIRED');
assert(accountId.length >= 20, 'CLOUDFLARE_ACCOUNT_ID_REQUIRED');
assert(bucket.length >= 3, 'MEL_R2_BUCKET_REQUIRED');

const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
const objectKey = `bootstrap-challenges/${scope}/${tokenHash}.json`;
const payload = {
  schema: 'mel.gen2-42-bootstrap-challenge/v2',
  token_hash: tokenHash,
  scope,
  expires_at: expiresAt,
  created_at: now,
  raw_token_exposed: false,
};
const form = new FormData();
form.append('body', new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'challenge.json');

const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}/objects/${keyPath(objectKey)}`;
const response = await fetch(url, {
  method: 'PUT',
  headers: { authorization: `Bearer ${cfToken}` },
  body: form,
  signal: AbortSignal.timeout(60_000),
});
const body = await response.json().catch(() => ({}));
if (!response.ok || body?.success !== true) {
  throw Object.assign(new Error('GEN2_42_R2_CHALLENGE_WRITE_FAILED'), {
    code: 'GEN2_42_R2_CHALLENGE_WRITE_FAILED',
    status: response.status,
    provider_code: body?.errors?.[0]?.code || null,
  });
}

console.log(JSON.stringify({
  ok: true,
  scope,
  expires_at: expiresAt,
  token_hash_prefix: tokenHash.slice(0, 12),
  transport: 'r2',
  raw_token_exposed: false,
}));
