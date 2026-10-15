import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateComputerUsePlan } from '../src/devices/computer-use.js';

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
