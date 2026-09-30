import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const token = String(process.env.MEL_GEN2_42_CHALLENGE_TOKEN || '');
const scope = 'gen2-42-runtime-tick';
const now = Date.now();
const expiresAt = now + 5 * 60 * 1000;

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

function sqlString(value) {
  return "'" + String(value ?? '').replaceAll("'", "''") + "'";
}

function d1(sql) {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw Object.assign(new Error('GEN2_42_D1_CHALLENGE_WRITE_FAILED'), {
      code: 'GEN2_42_D1_CHALLENGE_WRITE_FAILED',
      detail: String(result.stderr || result.stdout || '').slice(0, 4000),
    });
  }
}

assert(token.length >= 32, 'GEN2_42_CHALLENGE_TOKEN_REQUIRED');
assert(String(process.env.CLOUDFLARE_API_TOKEN || '').length >= 20, 'CLOUDFLARE_API_TOKEN_REQUIRED');
assert(String(process.env.CLOUDFLARE_ACCOUNT_ID || '').length >= 20, 'CLOUDFLARE_ACCOUNT_ID_REQUIRED');

const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');

d1(`CREATE TABLE IF NOT EXISTS mel_bootstrap_challenges (
  token_hash TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
)`);

d1(`INSERT INTO mel_bootstrap_challenges(token_hash,scope,expires_at,consumed_at,created_at)
  VALUES(${sqlString(tokenHash)},${sqlString(scope)},${expiresAt},NULL,${now})
  ON CONFLICT(token_hash) DO UPDATE SET
    scope=excluded.scope,
    expires_at=excluded.expires_at,
    consumed_at=NULL,
    created_at=excluded.created_at`);

console.log(JSON.stringify({
  ok: true,
  scope,
  expires_at: expiresAt,
  token_hash_prefix: tokenHash.slice(0, 12),
  transport: 'wrangler-d1',
  raw_token_exposed: false,
}));
