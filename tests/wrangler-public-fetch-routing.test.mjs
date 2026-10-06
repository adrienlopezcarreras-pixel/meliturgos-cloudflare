import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production Worker uses public global fetch routing for Cloudflare API subrequests', async () => {
  const source = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(source, /"compatibility_flags"\s*:\s*\[[^\]]*"global_fetch_strictly_public"[^\]]*\]/);
});


test('production Worker declares owner auth and recoverable backup-root secrets as required inherited secrets', async () => {
  const source = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(source, /"secrets"\s*:\s*\{[\s\S]*"required"\s*:\s*\[[^\]]*"MELITURGOS_PASSWORD"[^\]]*\]/);
  assert.match(source, /"required"\s*:\s*\[[^\]]*"MEL_BACKUP_ENCRYPTION_KEY_ID"[^\]]*\]/);
  assert.match(source, /"required"\s*:\s*\[[^\]]*"MEL_BACKUP_ENCRYPTION_KEY_B64"[^\]]*\]/);
});

test('production release enforces the centralized persistent-secret contract before deployment', async () => {
  const source = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(source, /Require persistent production secrets before exact deploy/);
  assert.match(source, /PRODUCTION_REQUIRED_SECRETS_MISSING/);
  assert.match(source, /readFileSync\('wrangler\.jsonc'/);
  assert.doesNotMatch(source, /PRODUCTION_OWNER_AUTH_SECRET_MISSING/);
});
