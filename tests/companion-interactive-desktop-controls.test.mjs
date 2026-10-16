import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');

test('MEL Work exposes explicit time-limited Windows desktop interaction controls', () => {
  for (const id of [
    'workComputerRemoteControl',
    'workComputerControlConsent',
    'workComputerControlText',
    'workComputerControlKey',
    'workComputerSendText',
    'workComputerSendKey',
    'workComputerRefreshScreen',
    'workComputerStop',
    'workComputerControlState',
    'workComputerControlOut',
  ]) assert.ok(page.includes('id="' + id + '"') || page.includes("qs('#" + id + "')"), 'missing control: ' + id);
  assert.match(page, /workComputerControlExpiresAt=now\+10\*60\*1000/);
  assert.match(page, /consent\?\.checked!==true/);
  assert.match(page, /remote_access_enabled!==true/);
  assert.match(page, /now-heartbeat>20000/);
  assert.match(page, /now-engine>20000/);
});

test('interactive desktop commands use the authenticated existing Companion relay only', () => {
  assert.match(page, /\/api\/computer\/v1\/commands/);
  assert.match(page, /action:'cursor\.move'/);
  assert.match(page, /action:'pointer\.click'/);
  assert.match(page, /addEventListener\('wheel'/);
  assert.match(page, /action:'pointer\.scroll'/);
  assert.match(page, /delta_y:delta/);
  assert.match(page, /action:'keyboard\.type'/);
  assert.match(page, /action:'keyboard\.press'/);
  assert.match(page, /approve_sensitive:true/);
  assert.match(page, /\/api\/computer\/v1\/status/);
  assert.match(page, /command\.status==='SUCCEEDED'/);
  assert.match(page, /command\.status==='FAILED'\|\|command\.status==='CANCELLED'/);
  assert.match(page, /screen_bounds:output\.screen_bounds\|\|null/);
  assert.match(page, /Number\(bounds\.width\)/);
  assert.match(page, /Number\(bounds\.height\)/);
  assert.match(page, /Number\(bounds\.left\)/);
  assert.match(page, /Number\(bounds\.top\)/);
  assert.doesNotMatch(page, /action:'shell\.exec'/);
  assert.doesNotMatch(page, /action:'process\.spawn'/);
});

test('the interactive control panel can issue a server-side emergency HALT and resets local consent first', () => {
  const handler = page.slice(page.indexOf("qs('#workComputerStop').onclick="), page.indexOf("qs('#workComputerSelect').onchange="));
  assert.ok(handler.length > 0);
  assert.ok(handler.indexOf("workComputerControlConsent').checked=false") < handler.indexOf("'/api/computer/v1/halt'"));
  assert.match(handler, /OWNER_HALT_NOT_CONFIRMED/);
  assert.match(handler, /Stop local dans Companion Windows/);
});

test('virtual-screen origin and original dimensions survive PNG downscaling for accurate pointer mapping', async () => {
  const asset = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const packaged = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(asset, packaged);
  assert.match(asset, /\$bounds = \[System\.Windows\.Forms\.SystemInformation\]::VirtualScreen/);
  assert.match(asset, /Capture-PngBytes \$bounds/);
  for (const field of ['left', 'top', 'width', 'height']) {
    assert.ok(asset.includes(field + ' = [int]$bounds.' + field[0].toUpperCase() + field.slice(1)), 'missing virtual-screen bound: ' + field);
  }
  assert.match(asset, /screen_bounds=\$shot\.screen_bounds/);
  assert.match(asset, /screen_bounds = \{/);
});
