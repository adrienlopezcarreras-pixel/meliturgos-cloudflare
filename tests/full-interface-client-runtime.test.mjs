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
  assert.match(match[1], /qsa\('#nav button\[data-view\]'\)\.forEach/, 'sidebar navigation must be bound');
  assert.match(match[1], /qsa\('\[data-jump\]'\)\.forEach/, 'overview action buttons must be bound');
  assert.match(match[1], /Sauvegardes réelles[\s\S]*\\n/, 'ShardVault status output newline must remain escaped in browser JS');
});


test('full interface keeps capabilities while avoiding eager heavy hidden-panel loading', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match);
  const runtime = match[1];
  assert.match(runtime, /const PANEL_TTL_MS=15000,panelLoadedAt=new Map\(\),getInflight=new Map\(\)/);
  assert.match(runtime, /async function loadCapabilitiesData\(force=false\)/);
  assert.match(runtime, /async function loadRoadmapData\(force=false\)/);
  assert.match(runtime, /async function loadPanel\(name,force=false\)/);
  assert.match(runtime, /lora:\(\)=>loadFreeLoraStatus\(\)/);
  assert.match(runtime, /Promise\.allSettled\(\[loadCapabilitySummary\(\),loadRoadmapSummary\(\),loadAutonomy\(\)\]\)/);
  assert.doesNotMatch(runtime, /async function boot\(\)\{[^}]*loadFreeLoraStatus\(\)/);
  const boot = runtime.match(/async function boot\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(boot, /codeCheck\(/, 'code self-check must stay manual for fast boot');
  assert.match(runtime, /document\.createDocumentFragment\(\)/);
  assert.match(html, /content-visibility:auto/);
});
