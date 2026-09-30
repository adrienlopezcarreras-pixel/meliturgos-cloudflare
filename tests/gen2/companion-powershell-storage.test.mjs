import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const rel of [
  '../../assets/MEL-Computer-Companion.ps1',
  '../../dist/MEL-Computer-Companion.ps1',
]) {
  test(`PowerShell local storage is sandboxed and wired: ${rel}`,async()=>{
    const source=await readFile(new URL(rel,import.meta.url),'utf8');
    assert.match(source,/function Perform-SovereigntyStorage/);
    assert.match(source,/function Resolve-SovereigntyStorageKey/);
    assert.match(source,/MEL\\Sovereignty/);
    assert.match(source,/SOVEREIGNTY_STORAGE_KEY_OUTSIDE_SANDBOX/);
    assert.match(source,/sovereignty\.storage\./);
    assert.match(source,/Perform-SovereigntyStorage/);
    assert.match(source,/FromBase64String/);
    assert.match(source,/ToBase64String/);
    assert.doesNotMatch(source,/sovereignty\.storage\.shell/);
  });
}

test('PowerShell companion remains structurally singular after storage extension',async()=>{
  const source=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const count=s=>source.split(s).length-1;
  assert.equal(count('function Perform-Step'),1);
  assert.equal(count('function Process-Command'),1);
  assert.equal(count('function Perform-SovereigntySourceControl'),1);
  assert.equal(count('function Perform-SovereigntyStorage'),1);
});
