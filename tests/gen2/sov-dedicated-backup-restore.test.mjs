import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const file of [
  '../../.github/workflows/mel-sov-01-live-proof.yml',
  '../../.github/workflows/release-downstream-proof-decoupled.yml',
]) {
  test('SOV uses dedicated backup_restore stages instead of infrastructure duplication: '+file, async () => {
    const source=await readFile(new URL(file, import.meta.url),'utf8');
    assert.match(source,/for STEP in runtime storage database ci_cd secrets_identity scheduler observability; do/);
    assert.doesNotMatch(source,/for STEP in runtime storage database ci_cd secrets_identity scheduler observability backup_restore; do/);
    assert.match(source,/for STEP in resolve prepare readback rollback finalize; do/);
    assert.match(source,/refresh_sov_target "backup_restore" "\$\{STEP\}"/);
  });
}
