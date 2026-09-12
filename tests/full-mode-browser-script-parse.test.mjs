import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { onRequestGet } from '../src/pages/full-interface-v5-runtime-fix.js';

test('full mode inline browser scripts are syntactically valid JavaScript', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.equal(response.headers.get('x-mel-full-mode-js'), 'repaired-polished-v3-bounded-chat');
  assert.match(html, /mel-full-polish-runtime/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim());

  assert.ok(scripts.length > 0, 'expected at least one inline browser script');
  scripts.forEach((source, index) => {
    try {
      new vm.Script(source, { filename: `full-mode-inline-${index + 1}.js` });
    } catch (error) {
      assert.fail(`inline browser script ${index + 1} must parse:\n${error?.stack || error}`);
    }
  });
});
