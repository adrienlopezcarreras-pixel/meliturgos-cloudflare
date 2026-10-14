import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const target of ['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1']){
 test('Windows desktop view fails closed unless explicit local consent: '+target,async()=>{
  const code=await readFile(new URL(target,import.meta.url),'utf8');
  const handler=code.slice(code.indexOf('function Process-Command($command) {'),code.indexOf('$trayResources = $null'));
  assert.match(handler,/mel\.companion\.desktop-view-request\/v1/);
  assert.match(handler,/desktop\.view\.request/);
  assert.match(handler,/DESKTOP_VIEW_PLAN_INVALID/);
  assert.match(handler,/DESKTOP_VIEW_LOCAL_UI_UNAVAILABLE/);
  assert.match(handler,/DESKTOP_VIEW_LOCAL_CONSENT_DENIED/);
  assert.match(handler,/DESKTOP_VIEW_CONSENT_EXPIRED/);
  assert.match(handler,/MessageBoxDefaultButton\]::Button2/);
  assert.ok(handler.indexOf('MessageBox]::Show')<handler.indexOf('Upload-Screenshot'));
  assert.ok(handler.indexOf('Upload-Screenshot')<handler.indexOf('capture_count=1'));
 });
}
