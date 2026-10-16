import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

test('foreground inspection is read-only and stays in paired Computer Use policy', () => {
  const verdict=evaluateComputerUsePlan({session_id:'s',device:{id:'paired',capabilities:['computer.use']},sandbox:{allowed_apps:[],allowed_paths:[],allowed_origins:[]},steps:[{id:'inspect',action:'browser.inspect'}]});
  assert.equal(verdict.allowed,true);
  assert.equal(verdict.decisions[0].risk,'OBSERVE');
});

test('Windows inspection does not expose page content or credentials', async () => {
  const source=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const dist=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.equal(source,dist);
  const start=source.indexOf('"browser.inspect" {');
  const end=source.indexOf('"app.open" {',start);
  assert.ok(start>0&&end>start);
  const handler=source.slice(start,end);
  assert.match(handler,/Assert-ForegroundBrowser/);
  assert.match(handler,/Active-Window/);
  assert.match(handler,/read_only=\$true/);
  assert.match(handler,/observed_at_utc=/);
  assert.match(handler,/window_handle=/);
  assert.doesNotMatch(handler,/Get-Clipboard|Upload-Screenshot|Invoke-WebRequest|Get-Credential/);
});

test('Windows browser inspect returns clipped screen coordinates without accessing private page data', async () => {
  const source=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  const dist=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
  assert.equal(source,dist);
  const begin=source.indexOf('"browser.inspect" {');
  const end=source.indexOf('"app.open" {',begin);
  assert.ok(begin>=0 && end>begin);
  const handler=source.slice(begin,end);
  assert.match(handler,/GetWindowRect\(\$windowHandle, \[ref\]\$rect\)/);
  assert.match(handler,/SystemInformation\]::VirtualScreen/);
  assert.match(handler,/\[Math\]::Max\(\$rect.Left, \$virtual.Left\)/);
  assert.match(handler,/\[Math\]::Min\(\$rect.Right, \$virtual.Right\)/);
  assert.match(handler,/BROWSER_INSPECT_BOUNDS_REQUIRED/);
  assert.match(handler,/GetForegroundWindow\(\) -ne \$windowHandle/);
  assert.match(handler,/BROWSER_INSPECT_FOCUS_CHANGED/);
  assert.match(handler,/visible_bounds=@\{ left=\$left; top=\$top; width=\(\$right - \$left\); height=\(\$bottom - \$top\) \}/);
  assert.match(handler,/coordinate_space="virtual-screen-pixels"/);
  assert.doesNotMatch(handler,/Get-Clipboard|Upload-Screenshot|Invoke-WebRequest|Get-Credential/);
});

test('browser.inspect refuses any unsupported target or requested private content', () => {
  const base = {
    session_id: 'inspection', device: { id: 'windows', capabilities: ['computer.use'] },
    sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
  };
  const step = { id: 'inspect', action: 'browser.inspect' };
  const check = item => evaluateComputerUsePlan({ ...base, steps: [item] });
  assert.equal(check(step).allowed, true);
  for (const [field, value] of [
    ['window_handle', '12345'], ['url', 'https://example.com'],
    ['text', 'passwords'], ['key', 'CTRL+A'], ['app', 'browser'],
    ['path', 'C:\\\\Users'], ['x', 1], ['y', 2],
    ['selector', 'password'], ['include_page_text', true],
    ['capture', true], ['unknown', null],
  ]) {
    const decision = check({ ...step, [field]: value });
    assert.equal(decision.allowed, false, field);
    assert.equal(decision.reason, 'BROWSER_INSPECT_UNEXPECTED_FIELD', field);
  }
});

test('unsupported inspection blocks all preceding native commands before dispatch', async () => {
  const performed = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => performed.push(item.action) },
    authorize: async () => true,
    audit: async item => audits.push(item),
  });
  await assert.rejects(controller.execute({
    session_id: 'inspection', device: { id: 'windows', capabilities: ['computer.use'] },
    sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
    steps: [
      { id: 'screen', action: 'screen.capture' },
      { id: 'inspect', action: 'browser.inspect', text: 'private page' },
    ],
  }), error => error.code === 'BROWSER_INSPECT_UNEXPECTED_FIELD');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});
