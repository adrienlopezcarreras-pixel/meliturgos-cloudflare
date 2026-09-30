import { createHash } from 'node:crypto';

const token = String(process.env.MEL_GEN2_42_CHALLENGE_TOKEN || '');
const cfToken = String(process.env.CLOUDFLARE_API_TOKEN || '');
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '');
const databaseId = String(process.env.MEL_D1_DATABASE_ID || '');
const scope = 'gen2-42-runtime-tick';
const now = Date.now();
const expiresAt = now + 5 * 60 * 1000;

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

async function d1(sql, params) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success !== true) {
    throw Object.assign(new Error('GEN2_42_D1_CHALLENGE_WRITE_FAILED'), {
      code: 'GEN2_42_D1_CHALLENGE_WRITE_FAILED',
      status: response.status,
    });
  }
}

assert(token.length >= 32, 'GEN2_42_CHALLENGE_TOKEN_REQUIRED');
assert(cfToken.length >= 20, 'CLOUDFLARE_API_TOKEN_REQUIRED');
assert(accountId.length >= 20, 'CLOUDFLARE_ACCOUNT_ID_REQUIRED');
assert(/^[0-9a-f-]{36}$/i.test(databaseId), 'MEL_D1_DATABASE_ID_REQUIRED');

const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
await d1(`CREATE TABLE IF NOT EXISTS mel_bootstrap_challenges (
  token_hash TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
)`, []);
await d1(`INSERT INTO mel_bootstrap_challenges(token_hash,scope,expires_at,consumed_at,created_at)
  VALUES(?,?,?,?,?)
  ON CONFLICT(token_hash) DO UPDATE SET
    scope=excluded.scope,
    expires_at=excluded.expires_at,
    consumed_at=NULL,
    created_at=excluded.created_at`,
  [tokenHash, scope, expiresAt, null, now]);

console.log(JSON.stringify({
  ok: true,
  scope,
  expires_at: expiresAt,
  token_hash_prefix: tokenHash.slice(0, 12),
  raw_token_exposed: false,
}));
