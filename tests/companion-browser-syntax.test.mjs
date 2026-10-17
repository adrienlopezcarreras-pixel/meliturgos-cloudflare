import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('served MEL full-control browser script parses with Companion screenshot follow-up', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  const inlineScripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(match => match[1]);
  const controlScript = inlineScripts.find(source => source.includes('followChatComputerScreenshot('));
  assert.ok(controlScript, 'served browser bundle must contain the screenshot follow-up');
  assert.match(controlScript,/async function followChatComputerScreenshot\\(command\\)/);
  assert.doesNotThrow(() => new Script(controlScript, { filename: 'mel-full-control-inline.js' }));
});
