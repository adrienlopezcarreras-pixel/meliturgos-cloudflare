import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('full interface emits parseable browser runtime and keeps core navigation bindings', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'inline browser runtime must be present');
  assert.doesNotThrow(() => new Function(match[1]), 'generated browser runtime must parse');
  assert.match(match[1], /qsa\('#nav button'\)\.forEach/, 'sidebar navigation must be bound');
  assert.match(match[1], /qsa\('\[data-jump\]'\)\.forEach/, 'overview action buttons must be bound');
  assert.match(match[1], /Cibles actives[\s\S]*\\n/, 'ShardVault output newline must remain escaped in browser JS');
});
