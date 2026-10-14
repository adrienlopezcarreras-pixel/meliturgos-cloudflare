import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

for(const path of ['../assets/MEL-Computer-Companion.ps1','../dist/MEL-Computer-Companion.ps1']){
 test('Windows Companion re-reads local permission for every desktop step: '+path,async()=>{
  const code=await readFile(new URL(path,import.meta.url),'utf8');
  const check=code.slice(code.indexOf('function Assert-LocalRemoteAccess {'),code.indexOf('function Perform-Step('));
  const perform=code.slice(code.indexOf('function Perform-Step('),code.indexOf('function Process-Command('));
  const heartbeat=code.slice(code.indexOf('function Send-Heartbeat {'),code.indexOf('function Capture-PngBytes {'));
  const view=code.slice(code.indexOf('function Process-Command($command) {'),code.indexOf('$trayResources = $null'));
  assert.match(heartbeat,/try \{ Assert-LocalRemoteAccess; \$remoteEnabled = \$true \} catch \{\}/);
  assert.match(heartbeat,/remote_access_enabled = \$remoteEnabled/);
  assert.doesNotMatch(heartbeat,/remote_access_enabled = \(\$config\.remote_access_enabled/);
  assert.match(view,/if \(-not \[Environment\]::UserInteractive\)/);
  assert.match(view,/Assert-LocalRemoteAccess/);
  assert.ok(view.indexOf('Assert-LocalRemoteAccess')<view.indexOf('MessageBox]::Show'));

  assert.match(check,/Test-Path -LiteralPath \$ConfigPath -PathType Leaf/);
  assert.match(check,/Get-Content -Raw -Encoding UTF8 -LiteralPath \$ConfigPath/);
  assert.match(check,/\$current\.remote_access_enabled -ne \$true/);
  assert.match(check,/catch\s*\{\s*throw "REMOTE_ACCESS_DISABLED_LOCALLY"/);
  const pc=perform.slice(perform.indexOf('if ($planSchema -eq "mel.devices.pc-control.v1")'),perform.indexOf('if ($action.StartsWith("sovereignty.")'));
  assert.match(pc,/Assert-LocalRemoteAccess/);
  const desktop=perform.slice(perform.indexOf('throw "SOVEREIGNTY_ACTION_NOT_SUPPORTED"'),perform.indexOf('switch ($action) {'));
  assert.match(desktop,/Assert-LocalRemoteAccess/);
  assert.ok(perform.indexOf('Assert-LocalRemoteAccess',perform.indexOf('throw "SOVEREIGNTY_ACTION_NOT_SUPPORTED"'))<perform.indexOf('switch ($action) {'));
  for(const action of ['screen.capture','cursor.move','pointer.click','keyboard.press','keyboard.type','app.open','file.open','clipboard.read','power.off']){
   assert.ok(perform.includes('"'+action+'" {'),'Missing guarded action: '+action);
  }
 });
}
