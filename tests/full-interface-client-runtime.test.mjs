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
  assert.match(runtime, /async function loadDashboardSummary\(refreshHealth=false\)/);
  assert.match(runtime, /dashboard-summary\?refresh='\+\(refreshHealth\?'1':'0'\)/);
  assert.match(runtime, /Promise\.allSettled\(\[loadDashboardSummary\(false\),loadAutonomy\(\)\]\)/);
  assert.match(runtime, /loadDashboardSummary\(true\)/, 'overview must refresh real provider health after fast initial render');
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


test('full interface exposes Vercel connection controls and bounded redeploy actions', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.match(html, />Vercel</);
  assert.match(html, /id="vercelToken"/);
  assert.match(html, /id="vercelTeamId"/);
  assert.match(html, /id="vercelProjectId"/);
  assert.match(html, /id="vercelProjectName"/);
  assert.match(html, /id="vercelSave"/);
  assert.match(html, /id="vercelTest"/);
  assert.match(html, /id="vercelDeploymentSelect"/);
  assert.match(html, /id="vercelRedeployPreview"/);
  assert.match(html, /id="vercelRedeployProduction"/);
  assert.match(html, /x-mel-approve-capability/);
  assert.match(html, /vercel\.deployments\.redeploy/);
});


test('capability health UI uses real refreshes instead of presenting startup defaults as final health', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match);
  const runtime = match[1];
  assert.match(html, /État réel vérifié automatiquement/);
  assert.match(runtime, /skills:\(\)=>loadSkills\(true\)/);
  assert.match(runtime, /chat:\(\)=>loadChatCapabilities\(true\)/);
  assert.match(runtime, /\/api\/gen2\/capabilities\?refresh=1/);
  assert.match(runtime, /loadDashboardSummary\(true\)/);
});
