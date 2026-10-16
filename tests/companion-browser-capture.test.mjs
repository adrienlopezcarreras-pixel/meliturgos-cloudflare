import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';
const plan=approved=>evaluateComputerUsePlan({session_id:'s',device:{id:'pc',capabilities:['computer.use']},sandbox:{allowed_origins:[],allowed_paths:[],allowed_apps:[]},steps:[{id:'capture',action:'browser.capture',window_handle:'123456'}],approvals:approved?[{session_id:'s',step_id:'capture',action:'browser.capture',approved:true}]:[]});
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
  assert.ok(upload.split(focus).length-1>=2);
  const lastCheck=upload.lastIndexOf(focus);
  const transfer=upload.indexOf('return Invoke-RestMethod');
  const validation=upload.indexOf('SCREENSHOT_BINARY_PAYLOAD_INVALID');
  assert.ok(lastCheck>validation && transfer>lastCheck);
});

test('browser capture checks locally requested STOP after encoding before upload',async()=>{
  const a=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const b=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.equal(a,b);
  const start=a.indexOf('function Upload-BrowserScreenshot(');
  const end=a.indexOf('function Key-Token(',start);
  const upload=a.slice(start,end);
  const capture=upload.indexOf('Capture-PngBytes $bounds');
  const stop=upload.lastIndexOf('Assert-UnattendedCapturePermission');
  const transfer=upload.indexOf('return Invoke-RestMethod');
  assert.ok(capture>=0 && stop>capture && transfer>stop);
});

test('browser screenshot must verify the approved foreground browser before reading pixels',async()=>{
  const asset=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const dist=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.equal(asset,dist);
  const start=asset.indexOf('function Upload-BrowserScreenshot(');
  const end=asset.indexOf('function Key-Token(',start);
  const fn=asset.slice(start,end);
  const capture=fn.indexOf('[byte[]]$bytes = Capture-PngBytes $bounds');
  assert.ok(capture>0);
  const pre=fn.slice(0,capture);
  assert.match(pre,/GetForegroundWindow\(\) -ne \$window/);
  assert.match(pre,/Assert-ForegroundBrowser/);
  assert.match(pre,/BROWSER_CAPTURE_FOCUS_CHANGED/);
});

test('browser capture is restricted to exactly the inspected browser HWND', () => {
  const base = {
    session_id: 'owner-capture', device: { id: 'windows', capabilities: ['computer.use'] },
    sandbox: { allowed_apps: [], allowed_origins: [], allowed_paths: [] },
  };
  const step = { id: 'shot', action: 'browser.capture', window_handle: '123456' };
  const check = item => evaluateComputerUsePlan({
    ...base, steps: [item],
    approvals: [{ approved: true, session_id: base.session_id, step_id: item.id, action: item.action }],
  });
  assert.equal(check(step).allowed, true);
  for (const window_handle of ['', '0', '-1', ' 123456', '1e5', '9223372036854775808']) {
    assert.equal(check({ ...step, window_handle }).reason,
      'BROWSER_CAPTURE_WINDOW_HANDLE_REQUIRED', window_handle);
  }
  for (const [field, value] of [
    ['url', 'https://example.com'], ['text', 'private'],
    ['x', 5], ['y', 10], ['width', 300], ['height', 200],
    ['app', 'browser'], ['path', 'C:\\\\secret'],
    ['selector', 'password'], ['region', 'other-screen'], ['unknown', null],
  ]) {
    const decision = check({ ...step, [field]: value });
    assert.equal(decision.allowed, false, field);
    assert.equal(decision.reason, 'BROWSER_CAPTURE_UNEXPECTED_FIELD', field);
  }
});

test('invalid capture target refuses the entire plan before any earlier adapter action', async () => {
  const performed = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => performed.push(item.action) },
    authorize: async () => true,
    audit: async row => audits.push(row),
  });
  await assert.rejects(controller.execute({
    session_id: 'owner-capture', device: { id: 'windows', capabilities: ['computer.use'] },
    sandbox: { allowed_apps: [], allowed_origins: [], allowed_paths: [] },
    steps: [
      { id: 'inspect', action: 'browser.inspect' },
      { id: 'shot', action: 'browser.capture', window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_CAPTURE_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});

test('native screenshot only captures after the same inspected HWND survives local consent', async () => {
  const asset = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(asset, dist);
  const from = asset.indexOf('"browser.capture" {');
  const to = asset.indexOf('"browser.inspect" {', from);
  assert.ok(from > 0 && to > from);
  const handler = asset.slice(from, to);
  for (const token of [
    'TryParse([string]$step.window_handle',
    '$window.ToInt64() -ne $expectedHandle',
    'Assert-ForegroundBrowser', 'Assert-UnattendedCapturePermission',
    'Assert-BrowserShortcutTarget $window $browser',
    'GetWindowRect($window', 'Upload-BrowserScreenshot $commandId $bounds $window $browser',
    'window_handle=$expectedHandle', 'window_only_capture=$true',
  ]) assert.ok(handler.includes(token), token);
  assert.ok(handler.indexOf('Assert-UnattendedCapturePermission') <
    handler.indexOf('Assert-BrowserShortcutTarget $window $browser'));
  assert.ok(handler.indexOf('Assert-BrowserShortcutTarget $window $browser') <
    handler.indexOf('GetWindowRect($window'));
  assert.ok(handler.indexOf('GetWindowRect($window') <
    handler.indexOf('Upload-BrowserScreenshot $commandId $bounds $window $browser'));
});
