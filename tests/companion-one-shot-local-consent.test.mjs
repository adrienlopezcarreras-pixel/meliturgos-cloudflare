import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const path of ['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1']){
 test('consented desktop view works unattended only while local prior permission and bounded plan remain valid: '+path,async()=>{
  const code=await readFile(new URL(path,import.meta.url),'utf8');
  const guard=code.slice(code.indexOf('function Assert-LocalRemoteAccess {'),code.indexOf('function Perform-Step('));
  const handler=code.slice(code.indexOf('function Process-Command($command) {'),code.indexOf('$trayResources = $null'));
  assert.match(guard,/Get-Content -Raw -Encoding UTF8 -LiteralPath \$ConfigPath/);
  assert.match(guard,/remote_access_enabled -ne \$true/);
  assert.match(guard,/SCREENSHOT_LOCAL_STOP_ACTIVE/);
  assert.match(handler,/DESKTOP_VIEW_PLAN_INVALID/);
  assert.match(handler,/Assert-UnattendedCapturePermission/);
  assert.doesNotMatch(handler,/MessageBox\]::Show/);
  assert.doesNotMatch(handler,/Environment\]::UserInteractive/);
  assert.match(handler,/DESKTOP_VIEW_CONSENT_EXPIRED/);
  assert.match(handler,/Upload-Screenshot/);
  assert.match(handler,/capture_count=1/);
  assert.match(handler,/DESKTOP_VIEW_UPLOAD_UNCONFIRMED/);
  assert.match(handler,/computer\/screenshots\/\$ComputerId/);
  assert.match(handler,/\$shot\.view_url -eq/);
  assert.ok(handler.indexOf('Assert-UnattendedCapturePermission')<handler.indexOf('Upload-Screenshot'));
  assert.ok(handler.indexOf('DESKTOP_VIEW_CONSENT_EXPIRED')<handler.indexOf('Upload-Screenshot'));
 });
}
