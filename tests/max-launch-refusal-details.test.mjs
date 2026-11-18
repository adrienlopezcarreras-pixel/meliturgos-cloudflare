import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('MAX refuses visibly with the real launch gate reason', async () => {
  const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('function apiErrorMessage(payload,status){');
  const end = source.indexOf('\nfunction rawFetch(url,opts)', start);
  assert.ok(start >= 0 && end > start);
  const apiErrorMessage = runInNewContext(source.slice(start, end) + '\napiErrorMessage;');
  const blocked = apiErrorMessage({
    code: 'AUTONOMY_LAUNCH_GATE_BLOCKED',
    readiness: { blockers: ['SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH', 'SHARDVAULT_LAUNCH_PROOF_INCOMPLETE'] },
  }, 409);
  assert.match(blocked, /SYSTEM_BACKUP_DEPLOYED_SHA_MISMATCH/);
  assert.match(blocked, /SHARDVAULT_LAUNCH_PROOF_INCOMPLETE/);
  assert.match(apiErrorMessage({
    code: 'AUTONOMY_LAUNCH_GATE_BLOCKED',
    readiness: { gates: { restore: { ok: false, status: 'NO_VERIFIED_SYSTEM_BACKUP' } } },
  }, 409), /NO_VERIFIED_SYSTEM_BACKUP/);
  assert.match(apiErrorMessage({ code: 'AUTONOMY_LAUNCH_GATE_BLOCKED' }, 409), /Activation refusée/);
});
