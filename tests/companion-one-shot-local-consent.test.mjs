import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const path of ['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1']){
 test('desktop one-shot capture requires local UI, explicit consent, and expiry check: '+path,async()=>{
  const code=await readFile(new URL(path,import.meta.url),'utf8');
  const handler=code.slice(code.indexOf('function Process-Command($command) {'),code.indexOf('$trayResources = $null'));
  assert.match(handler,/DESKTOP_VIEW_PLAN_INVALID/);
  assert.match(handler,/DESKTOP_VIEW_LOCAL_UI_UNAVAILABLE/);
  assert.match(handler,/\-not \[Environment\]::UserInteractive/);
  assert.doesNotMatch(handler,/\$Headless -or -not \[Environment\]::UserInteractive/);
  assert.match(handler,/remote_access_enabled/);
  assert.match(handler,/MessageBoxButtons\]::YesNo/);
  assert.match(handler,/MessageBoxDefaultButton\]::Button2/);
  assert.match(handler,/DESKTOP_VIEW_LOCAL_CONSENT_DENIED/);
  assert.match(handler,/DESKTOP_VIEW_CONSENT_EXPIRED/);
  assert.match(handler,/Upload-Screenshot/);
  assert.match(handler,/capture_count=1/);
  assert.match(handler,/DESKTOP_VIEW_UPLOAD_UNCONFIRMED/);
  assert.match(handler,/computer\/screenshots\/\$ComputerId/);
  assert.match(handler,/\$shot\.view_url -eq/);
  assert.ok(handler.indexOf('MessageBox]::Show') < handler.indexOf('Upload-Screenshot'));
  assert.ok(handler.indexOf('DESKTOP_VIEW_CONSENT_EXPIRED') < handler.indexOf('Upload-Screenshot'));
 });
}
