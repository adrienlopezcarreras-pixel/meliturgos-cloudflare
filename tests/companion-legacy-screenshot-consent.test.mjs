import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for (const path of ['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1']) {
 test('legacy screen.capture supports unattended owner-preauthorized use: '+path,async()=>{
  const code=await readFile(new URL(path,import.meta.url),'utf8');
  const start=code.indexOf('function Assert-UnattendedCapturePermission {');
  const end=code.indexOf('function Perform-Step(',start);
  assert.ok(start>=0&&end>start);
  const authorize=code.slice(start,end);
  assert.match(authorize,/SCREENSHOT_LOCAL_STOP_ACTIVE/);
  assert.match(authorize,/Assert-LocalRemoteAccess/);
  assert.doesNotMatch(authorize,/MessageBox/);
  const localCheck=code.slice(code.indexOf('function Assert-LocalRemoteAccess {'),start);
  assert.match(localCheck,/Get-Content -Raw -Encoding UTF8 -LiteralPath \$ConfigPath/);
  assert.match(localCheck,/\$current.remote_access_enabled -ne \$true/);

  const step=code.slice(end,code.indexOf('function Process-Command(',end));
  const capture=step.slice(step.indexOf('"screen.capture" {'),step.indexOf('"cursor.move" {'));
  assert.ok(capture.indexOf('Assert-UnattendedCapturePermission')<capture.indexOf('Upload-Screenshot'));
  assert.ok(capture.indexOf('Upload-Screenshot')<capture.indexOf('SCREENSHOT_UPLOAD_UNCONFIRMED'));
  assert.match(capture,/computer\/screenshots\/\$ComputerId/);

  const view=code.slice(code.indexOf('function Process-Command('));
  assert.match(view,/Assert-UnattendedCapturePermission/);
  assert.doesNotMatch(view,/MessageBox\]::Show/);
  assert.match(view,/DESKTOP_VIEW_CONSENT_EXPIRED/);
 });
}

test('source and Windows distribution have identical unattended access safeguards',async()=>{
 const a=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 const d=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 assert.equal(a,d);
});

test('unattended access is opted in from the local Windows settings and defaults off',async()=>{
 const code=await readFile(new URL('../windows-companion/MEL-Companion.cs',import.meta.url),'utf8');
 assert.match(code,/d\["remote_access_enabled"\] = false/);
 assert.match(code,/Checked=MelApp.ConfigBool\("remote_access_enabled"\)/);
 assert.match(code,/SavePermissions\(List<string> apps, List<string> paths, bool remoteAccessEnabled, bool localComputeEnabled, string localComputeProfile\)/);
 assert.match(code,/next\["remote_access_enabled"\] = remoteAccessEnabled/);
 assert.match(code,/next\["local_compute_enabled"\] = localComputeEnabled && localComputeProfile != "off"/);
 assert.match(code,/WriteConfigAtomically\(next\)/);
 assert.ok(code.indexOf('WriteConfigAtomically(next)') < code.indexOf('Config = next'));
 assert.match(code,/accéder à ce PC en mon absence/);
});
