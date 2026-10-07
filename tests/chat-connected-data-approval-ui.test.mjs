import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');

test('chat renders a two-step confirmation UI for protected capability mutations', () => {
  assert.match(source, /function renderChatApproval\(/);
  assert.match(source, /approval_required/);
  assert.match(source, /textContent='Confirmer'/);
  assert.match(source, /textContent='Annuler'/);
  assert.match(source, /x-mel-approve-capability/);
  assert.match(source, /String\(approval\.scope\|\|approval\.capability\)/);
});

test('chat approval replay uses the exact server-provided capability and input', () => {
  assert.match(source, /capability:\{id:String\(approval\.capability\),input:approval\.input\}/);
  assert.match(source, /approval_replay:true/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*approval/i);
});

test('normal chat never sends an approval header before the user confirms', () => {
  const sendStart = source.indexOf('async function sendChat');
  const sendEnd = source.indexOf('const pendingChatFiles', sendStart);
  const normalSend = source.slice(sendStart, sendEnd);
  assert.equal(normalSend.includes('x-mel-approve-capability'), false);
});
