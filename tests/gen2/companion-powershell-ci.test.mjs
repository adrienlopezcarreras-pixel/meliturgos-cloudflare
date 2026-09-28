import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const rel of [
  '../../assets/MEL-Computer-Companion.ps1',
  '../../dist/MEL-Computer-Companion.ps1',
]) {
  test(`PowerShell local CI is bounded and provenance-locked: ${rel}`,async()=>{
    const source=await readFile(new URL(rel,import.meta.url),'utf8');
    assert.match(source,/function Perform-SovereigntyCi/);
    assert.match(source,/function Read-SovereigntySourceProvenance/);
    assert.match(source,/SOVEREIGNTY_CI_PROVENANCE_REQUIRED/);
    assert.match(source,/SOVEREIGNTY_CI_EXTERNAL_RECONSTRUCTION_REQUIRED/);
    assert.match(source,/SOVEREIGNTY_CI_SOURCE_SHA_MISMATCH/);
    assert.match(source,/SOVEREIGNTY_CI_PIPELINE_NOT_ALLOWED/);
    assert.match(source,/sovereignty-smoke/);
    assert.match(source,/Invoke-SovereigntyNodeCheck/);
    assert.match(source,/WaitForExit\(\$timeoutMs\)/);
    assert.match(source,/sovereignty\.ci\.get_artifacts/);
    assert.match(source,/sovereignty\.ci\.cancel_run/);
    assert.doesNotMatch(source,/sovereignty\.ci\.shell/);
  });
}

test('PowerShell companion remains structurally singular after CI extension',async()=>{
  const source=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const count=s=>source.split(s).length-1;
  assert.equal(count('function Perform-Step'),1);
  assert.equal(count('function Process-Command'),1);
  assert.equal(count('function Perform-SovereigntyCi'),1);
  assert.equal(count('function Perform-SovereigntyDatabase'),1);
});
