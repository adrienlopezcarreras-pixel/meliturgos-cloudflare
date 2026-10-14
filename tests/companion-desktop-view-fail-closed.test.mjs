import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const target of ['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1']){
 test('Windows desktop view fails closed on revoked unattended opt-in or expired proof: '+target,async()=>{
  const code=await readFile(new URL(target,import.meta.url),'utf8');
  const permission=code.slice(code.indexOf('function Assert-UnattendedCapturePermission {'),code.indexOf('function Perform-Step('));
  const handler=code.slice(code.indexOf('function Process-Command($command) {'),code.indexOf('$trayResources = $null'));
  assert.match(handler,/mel\.companion\.desktop-view-request\/v1/);
  assert.match(handler,/desktop\.view\.request/);
  assert.match(handler,/DESKTOP_VIEW_PLAN_INVALID/);
  assert.match(handler,/DESKTOP_VIEW_CONSENT_EXPIRED/);
  assert.match(permission,/SCREENSHOT_LOCAL_STOP_ACTIVE/);
  assert.match(permission,/Assert-LocalRemoteAccess/);
  assert.ok(handler.indexOf('Assert-UnattendedCapturePermission')<handler.indexOf('Upload-Screenshot'));
  assert.ok(handler.indexOf('Upload-Screenshot')<handler.indexOf('capture_count=1'));
  assert.doesNotMatch(handler,/MessageBox\]::Show/);
 });
}
