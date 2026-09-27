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
  assert.match(runtime, /const PANEL_TTL_MS=30000,panelLoadedAt=new Map\(\),getInflight=new Map\(\)/);
  assert.match(runtime, /async function loadCapabilitiesData\(force=false\)/);
  assert.match(runtime, /async function loadRoadmapData\(force=false\)/);
  assert.match(runtime, /async function loadPanel\(name,force=false\)/);
  assert.match(runtime, /lora:\(\)=>loadFreeLoraStatus\(\)/);
  assert.match(runtime, /async function loadDashboardSummary\(\)/);
  assert.match(runtime, /Promise\.allSettled\(\[loadDashboardSummary\(\),loadAutonomy\(\)\]\)/);
  assert.doesNotMatch(runtime, /async function boot\(\)\{[^}]*loadFreeLoraStatus\(\)/);
  const boot = runtime.match(/async function boot\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(boot, /codeCheck\(/, 'code self-check must stay manual for fast boot');
  assert.match(runtime, /document\.createDocumentFragment\(\)/);
  assert.match(html, /content-visibility:auto/);
});


test('full interface exposes persistent connection controls for Gmail Yahoo Microsoft and Roundcube', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.match(html, /data-view="connections"/);
  assert.match(html, /data-panel="connections"/);
  assert.match(html, />Gmail</);
  assert.match(html, />Yahoo \/ Ymail</);
  assert.match(html, />Outlook</);
  assert.match(html, />OneDrive</);
  assert.match(html, />SharePoint</);
  assert.match(html, />Roundcube</);
  assert.match(html, /id="gmailConnect"/);
  assert.match(html, /id="outlookConnect"/);
  assert.match(html, /id="oneDriveConnect"/);
  assert.match(html, /id="sharePointConnect"/);
  assert.match(html, /id="yahooConnect"/);
  assert.match(html, /roundcubeSave/);
  assert.match(html, /roundcubeTest/);
  assert.match(html, /CONNECTÉ DURABLEMENT/);
  assert.match(html, /initialView=new URLSearchParams\(location\.search\)\.get\('view'\)/);
});
