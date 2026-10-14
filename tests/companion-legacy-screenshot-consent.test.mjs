import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for (const path of ['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1']) {
 test('legacy screen.capture requires fresh explicit Windows consent, default No: '+path,async()=>{
  const code=await readFile(new URL(path,import.meta.url),'utf8');
  const begin=code.indexOf('function Confirm-LegacyScreenCaptureConsent {');
  const end=code.indexOf('function Perform-Step(',begin);
  assert.ok(begin>0&&end>begin);
  const consent=code.slice(begin,end);
  assert.match(consent,/Assert-LocalRemoteAccess/);
  assert.match(consent,/-not \[Environment\]::UserInteractive/);
  assert.match(consent,/SCREENSHOT_LOCAL_UI_UNAVAILABLE/);
  assert.match(consent,/MessageBoxButtons\]::YesNo/);
  assert.match(consent,/MessageBoxDefaultButton\]::Button2/);
  assert.match(consent,/SCREENSHOT_LOCAL_CONSENT_DENIED/);
  assert.match(consent,/SCREENSHOT_LOCAL_STOP_ACTIVE/);
  assert.ok(consent.indexOf('SCREENSHOT_LOCAL_CONSENT_DENIED')<consent.lastIndexOf('Assert-LocalRemoteAccess'));

  const step=code.slice(end,code.indexOf('function Process-Command(',end));
  const capture=step.slice(step.indexOf('"screen.capture" {'),step.indexOf('"cursor.move" {'));
  assert.ok(capture.indexOf('Confirm-LegacyScreenCaptureConsent')<capture.indexOf('Upload-Screenshot'));
  assert.ok(capture.indexOf('Upload-Screenshot')<capture.indexOf('SCREENSHOT_UPLOAD_UNCONFIRMED'));
  assert.match(capture,/computer\/screenshots\/\$ComputerId/);

  const view=code.slice(code.indexOf('function Process-Command('));
  assert.match(view,/MessageBoxDefaultButton\]::Button2/);
  assert.match(view,/DESKTOP_VIEW_LOCAL_CONSENT_DENIED/);
 });
}

test('source and Windows package have identical consent implementation',async()=>{
 const a=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 const d=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 assert.equal(a,d);
});
