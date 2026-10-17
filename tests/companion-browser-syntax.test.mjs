import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('served MEL full-control browser script parses with Companion screenshot follow-up', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  const inlineScripts = html.split('<script').slice(1).map(chunk => {
    const tagEnd = chunk.indexOf('>');
    return tagEnd < 0 ? '' : chunk.slice(tagEnd + 1).split('</script>')[0];
  });
  const controlScript = inlineScripts.find(source => source.includes('followChatComputerScreenshot('));
  assert.ok(controlScript, 'served browser bundle must contain the screenshot follow-up');
  assert.ok(controlScript.includes('async function followChatComputerScreenshot(command)'));
  assert.doesNotThrow(() => new Script(controlScript, { filename: 'mel-full-control-inline.js' }));
});
