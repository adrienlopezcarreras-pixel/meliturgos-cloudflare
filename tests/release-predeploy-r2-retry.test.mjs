import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('predeploy backup retries transient Cloudflare R2 failures without weakening proof checks', async () => {
  const source = await readFile(new URL('../release-tools/predeploy-backup-refresh/runner.mjs', import.meta.url), 'utf8');
  assert.match(source, /WRANGLER_TRANSIENT_RE/);
  assert.match(source, /429\|500\|502\|503\|504\|520\|522\|524/);
  assert.match(source, /failed to fetch/);
  assert.match(source, /attempts:\s*6/);
  assert.match(source, /Transient Wrangler\/R2 failure on attempt/);
  assert.match(source, /BACKUP_R2_ROUNDTRIP_MISMATCH/);
  assert.match(source, /BACKUP_OBJECT_NOT_PROVEN_AFTER_UPLOAD/);
  assert.match(source, /restore_candidate_verified:true/);
});
