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

test('canonical Full chat ships and uses the shared safe rich renderer', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match);
  assert.match(html, /\.mel-rich-table-wrap/);
  assert.match(match[1], /window\.melRenderRichText=renderRichText/);
  assert.match(match[1], /role==='mel'&&typeof melRenderRichText==='function'/);
  assert.match(match[1], /melRenderRichText\(d,String\(text\?\?''\)\)/);
  assert.match(match[1], /target\.dataset\.richRendered='true'/);
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


test('full interface exposes Gmail plus Yahoo/Ymail through Pipedream while Microsoft remains consolidated there', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.match(html, /data-view="connections"/);
  assert.match(html, /data-panel="connections"/);
  assert.match(html, />Gmail</);
  assert.match(html, />Yahoo \/ Ymail</);
  assert.match(html, /id="gmailConnect"/);
  assert.doesNotMatch(html, /id="yahooUsername"/);
  assert.doesNotMatch(html, /id="yahooAppPassword"/);
  assert.doesNotMatch(html, /id="yahooSave"/);
  assert.doesNotMatch(html, /imap\.mail\.yahoo\.com/);
  assert.doesNotMatch(html, /smtp\.mail\.yahoo\.com/);
  assert.doesNotMatch(html, /id="outlookConnect"/);
  assert.doesNotMatch(html, /id="oneDriveConnect"/);
  assert.doesNotMatch(html, /id="sharePointConnect"/);
  assert.doesNotMatch(html, /id="microsoftAppSave"/);
  assert.match(html, /Pipedream Connect/);
  assert.match(html, /data-pd-connect="microsoft_outlook"/);
  assert.match(html, /data-pd-connect="microsoft_onedrive"/);
  assert.match(html, /data-pd-connect="sharepoint"/);
  assert.match(html, /data-pd-connect="imap"/);
  assert.match(html, /id="yahooPipedream"/);
  assert.match(html, /Gérer Yahoo\/Ymail via Pipedream/);
  assert.match(html, /initialView=new URLSearchParams\(location\.search\)\.get\('view'\)/);
});


test('full interface keeps optional Vercel backend out of the canonical owner control surface', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.doesNotMatch(html, /<h2>Vercel<\/h2>/);
  for (const id of [
    'vercelToken','vercelTeamId','vercelProjectId','vercelProjectName',
    'vercelSave','vercelTest','vercelDeploymentSelect',
    'vercelRedeployPreview','vercelRedeployProduction',
  ]) {
    assert.doesNotMatch(html, new RegExp('id="' + id + '"'));
  }
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

test('full interface exposes encrypted Pipedream Connect bridge and roadmap app buttons', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.match(html, />Pipedream Connect</);
  assert.match(html, /id="pipedreamProjectId"/);
  assert.match(html, /id="pipedreamClientId"/);
  assert.match(html, /id="pipedreamClientSecret"/);
  assert.match(html, /id="pipedreamEnvironment"/);
  assert.match(html, /id="pipedreamSave"/);
  assert.match(html, /id="pipedreamTest"/);
  assert.match(html, /id="pipedreamPrimaryState"/);
  assert.match(html, /connectionApi\('pipedream','accounts'\)/);
  assert.match(html, /data-pd-connect="microsoft_outlook"/);
  assert.match(html, /data-pd-connect="microsoft_onedrive"/);
  assert.match(html, /data-pd-connect="sharepoint"/);
  assert.match(html, /data-pd-connect="imap"/);
  assert.match(html, /data-pd-connect="lemlist"/);
  assert.match(html, /data-pd-connect="google_drive"/);
  assert.match(html, /data-pd-connect="google_calendar"/);
  assert.match(html, /data-pd-connect="google_tasks"/);
  assert.match(html, /data-pd-connect="dropbox"/);
  assert.match(html, /connectionApi\('pipedream','link'\)/);
  assert.match(html, /window\.location\.href=d\.connect_link_url/);
  assert.match(html, /Microsoft : /);
  assert.match(html, /DONE_VERIFIED · PIPEDREAM IMAP/);
});

test('LoRA interface exposes the current collector status instead of only a stale training run', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.match(html, /id="freeCollectorState"/);
  assert.match(html, /collector_workflow/);
  assert.match(html, /Collector Kaggle à jour/);
});
