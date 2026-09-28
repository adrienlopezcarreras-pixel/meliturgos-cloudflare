import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const rel of [
  '../../assets/MEL-Computer-Companion.ps1',
  '../../dist/MEL-Computer-Companion.ps1',
]) {
  test(`PowerShell local database is transactional and sandboxed: ${rel}`,async()=>{
    const source=await readFile(new URL(rel,import.meta.url),'utf8');
    assert.match(source,/function Perform-SovereigntyDatabase/);
    assert.match(source,/Sovereignty-DatabasePath/);
    assert.match(source,/SOVEREIGNTY_DATABASE_OUTSIDE_SANDBOX/);
    assert.match(source,/local-transactional-store/);
    assert.match(source,/Export-Clixml/);
    assert.match(source,/Import-Clixml/);
    assert.match(source,/sovereignty\.database\.begin/);
    assert.match(source,/sovereignty\.database\.commit/);
    assert.match(source,/sovereignty\.database\.rollback/);
    assert.match(source,/sovereignty\.database\.export_logical/);
    assert.match(source,/sovereignty\.database\.import_logical/);
    assert.match(source,/SOVEREIGNTY_DATABASE_SQL_NOT_SUPPORTED/);
    assert.doesNotMatch(source,/sovereignty\.database\.shell/);
  });
}

test('PowerShell companion remains structurally singular after database extension',async()=>{
  const source=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const count=s=>source.split(s).length-1;
  assert.equal(count('function Perform-Step'),1);
  assert.equal(count('function Process-Command'),1);
  assert.equal(count('function Perform-SovereigntyDatabase'),1);
  assert.equal(count('function Perform-SovereigntyStorage'),1);
});
