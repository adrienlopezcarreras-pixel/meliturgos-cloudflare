import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('computer API exposes dedicated sovereignty command route with strict whitelist',async()=>{
  const source=await readFile(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
  assert.match(source,/sovereigntyCommand:"\/api\/computer\/v1\/sovereignty-command"/);
  assert.match(source,/isLocalSovereigntyAction/);
  assert.match(source,/SOVEREIGNTY_ACTION_NOT_ALLOWED/);
  assert.match(source,/OWNER_HALT_ACTIVE/);
  assert.match(source,/COMPUTER_OFFLINE/);
  assert.match(source,/mel\.sovereignty\.local-command\/v1/);
});

test('PowerShell companion passes sovereignty plan schema into step execution',async()=>{
  for(const rel of [
    '../../assets/MEL-Computer-Companion.ps1',
    '../../dist/MEL-Computer-Companion.ps1',
  ]){
    const source=await readFile(new URL(rel,import.meta.url),'utf8');
    assert.match(source,/Perform-Step \$step \(\[string\]\$command\.id\) \(\[string\]\$command\.plan\.schema\)/);
    assert.match(source,/SOVEREIGNTY_COMMAND_SCHEMA_REQUIRED/);
    assert.match(source,/mel\.sovereignty\.local-command\/v1/);
  }
});

test('normal computer-use route remains separate from sovereignty queue',async()=>{
  const source=await readFile(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
  assert.match(source,/evaluateComputerUsePlan/);
  assert.match(source,/ownerSovereigntyCommand/);
  assert.doesNotMatch(source,/evaluateComputerUsePlan\([^)]*sovereignty/i);
});


test('local AI bootstrap child exclusively owns terminal status after launch',async()=>{
  for(const rel of [
    '../../assets/MEL-Computer-Companion.ps1',
    '../../dist/MEL-Computer-Companion.ps1',
  ]){
    const source=await readFile(new URL(rel,import.meta.url),'utf8');
    assert.match(source,/The child process owns ai-bootstrap-status\.json after launch/);
    assert.match(source,/OLLAMA_BOOTSTRAP_PROCESS_EXITED_AT_/);
    assert.match(source,/Start-Sleep -Milliseconds 250/);
    assert.doesNotMatch(source,/\$launched \| Add-Member -NotePropertyName process_id/);
    assert.doesNotMatch(source,/\$launched \| ConvertTo-Json -Depth 5 \| Set-Content -LiteralPath \$statusPath/);
  }
});
