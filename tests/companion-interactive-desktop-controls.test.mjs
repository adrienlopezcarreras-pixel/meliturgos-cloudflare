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
  assert.match(page, /action:'keyboard\.type'/);
  assert.match(page, /action:'keyboard\.press'/);
  assert.match(page, /approve_sensitive:true/);
  assert.match(page, /\/api\/computer\/v1\/status/);
  assert.match(page, /command\.status==='SUCCEEDED'/);
  assert.match(page, /command\.status==='FAILED'\|\|command\.status==='CANCELLED'/);
  assert.match(page, /naturalWidth\/rect\.width/);
  assert.match(page, /naturalHeight\/rect\.height/);
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
