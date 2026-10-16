import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateComputerUsePlan } from '../src/devices/computer-use.js';
const plan=approved=>evaluateComputerUsePlan({session_id:'s',device:{id:'pc',capabilities:['computer.use']},sandbox:{allowed_origins:[],allowed_paths:[],allowed_apps:[]},steps:[{id:'capture',action:'browser.capture'}],approvals:approved?[{session_id:'s',step_id:'capture',action:'browser.capture',approved:true}]:[]});
test('browser capture needs explicit step approval',()=>{assert.equal(plan(false).allowed,false);assert.equal(plan(true).allowed,true)});
test('browser capture requires foreground browser and local screenshot consent',async()=>{const a=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');const b=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');assert.equal(a,b);const handler=a.slice(a.indexOf('"browser.capture" {'),a.indexOf('"browser.inspect" {'));assert.match(handler,/Assert-ForegroundBrowser/);assert.match(handler,/Assert-UnattendedCapturePermission/);assert.match(handler,/Upload-BrowserScreenshot/);assert.match(handler,/full_desktop_capture=\$false/);assert.match(handler,/GetWindowRect/);assert.match(handler,/window_only_capture=\$true/)});

test('browser screenshot refuses changed foreground focus after pixel capture',async()=>{const a=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');const b=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');assert.equal(a,b);const start=a.indexOf('function Upload-BrowserScreenshot(');const end=a.indexOf('function Key-Token(',start);assert.ok(start>=0&&end>start);const upload=a.slice(start,end);assert.match(upload,/Capture-PngBytes \$bounds[\s\S]*GetForegroundWindow\(\) -ne \$window/);assert.match(upload,/Assert-ForegroundBrowser/);assert.match(upload,/BROWSER_CAPTURE_FOCUS_CHANGED/);assert.match(a,/Upload-BrowserScreenshot \$commandId \$bounds \$window \$browser/)});

test('browser screenshot validates unchanged focus again immediately before upload',async()=>{
  const a=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const b=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.equal(a,b);
  const start=a.indexOf('function Upload-BrowserScreenshot(');
  const end=a.indexOf('function Key-Token(',start);
  const upload=a.slice(start,end);
  const focus='[MelNative]::GetForegroundWindow() -ne $window';
  assert.equal(upload.split(focus).length-1,2);
  const lastCheck=upload.lastIndexOf(focus);
  const transfer=upload.indexOf('return Invoke-RestMethod');
  const validation=upload.indexOf('SCREENSHOT_BINARY_PAYLOAD_INVALID');
  assert.ok(lastCheck>validation && transfer>lastCheck);
});
