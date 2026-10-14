import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const target of ['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1']){
 test('Windows Companion rejects unimplemented desktop view without false SUCCESS: '+target,async()=>{
  const code=await readFile(new URL(target,import.meta.url),'utf8');
  const handler=code.slice(code.indexOf('function Process-Command($command) {'),code.indexOf('$trayResources = $null'));
  assert.match(handler,/mel\.companion\.desktop-view-request\/v1/);
  assert.match(handler,/desktop\.view\.request/);
  assert.match(handler,/throw 'DESKTOP_VIEW_WINDOWS_HANDLER_UNAVAILABLE'/);
  assert.ok(handler.indexOf('DESKTOP_VIEW_WINDOWS_HANDLER_UNAVAILABLE')<handler.indexOf('foreach ($step in @($command.plan.steps))'));
 });
}
