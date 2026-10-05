import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const rel of [
  '../../.github/workflows/mel-sov-01-live-proof.yml',
  '../../.github/workflows/release-downstream-proof-decoupled.yml',
]) {
  test('SOV proof refreshes only layers missing from the initial exact-SHA coverage: '+rel, async()=>{
    const source=await readFile(new URL(rel,import.meta.url),'utf8');
    assert.match(source,/layer_covered\(\)/);
    assert.match(source,/ALREADY_COVERED/);
    assert.match(source,/if layer_covered "source_control"/);
    assert.match(source,/if layer_covered "\$\{STEP\}"/);
    assert.match(source,/if layer_covered "backup_restore"/);
    assert.match(source,/if layer_covered "ai"/);
    assert.match(source,/mark_refresh_skipped/);
  });
}
