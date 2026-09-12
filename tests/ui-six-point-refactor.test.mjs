import test from 'node:test';
import assert from 'node:assert/strict';
import { MVP_BEHAVIOR_PATCH } from '../src/pages/mvp-behavior-enhancer.js';
import { MEL_INTERFACE_FINALIZER } from '../src/pages/mvp-interface-finalizer.js';
import { onRequestGet as renderFull, FULL_MODE_POLISH } from '../src/pages/full-interface-v5-runtime-fix.js';

test('normal mode removes audit and redundant daily controls', () => {
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /Audit MEL|installAudit|melAuditRefresh/);
  assert.match(MVP_BEHAVIOR_PATCH, /removeRedundantNormalMode/);
  assert.doesNotMatch(MEL_INTERFACE_FINALIZER, /Lectures du jour/);
  assert.match(MEL_INTERFACE_FINALIZER, /melAudit/);
  assert.match(MEL_INTERFACE_FINALIZER, /grid-template-columns:1\.25fr 1fr/);
});

test('normal mode reuses selected avatar and full-screen theme assets', () => {
  for (const asset of [
    '/assets/themes/mel-crusade.webp',
    '/assets/themes/mel-religious.webp',
    '/assets/themes/mel-granada.webp',
    '/assets/themes/mel-aviation.webp',
    '/assets/themes/mel-paladin.webp',
    '/assets/themes/mel-amazon.webp',
    '/assets/avatars/mel-classic.webp',
    '/assets/avatars/mel-religious-andalusian.webp',
    '/assets/avatars/mel-granada.webp',
    '/assets/avatars/mel-paladin-light-full-plate.webp',
  ]) assert.match(MEL_INTERFACE_FINALIZER, new RegExp(asset.replaceAll('/', '\\/').replaceAll('.', '\\.')));
  assert.match(MEL_INTERFACE_FINALIZER, /background-size:cover/);
});

test('full mode restores semantic roadmap colors and stronger text contrast', () => {
  assert.match(FULL_MODE_POLISH, /state-done/);
  assert.match(FULL_MODE_POLISH, /state-progress/);
  assert.match(FULL_MODE_POLISH, /state-blocked/);
  assert.match(FULL_MODE_POLISH, /state-planned/);
  assert.match(FULL_MODE_POLISH, /--muted:#d1dae8/);
  assert.match(FULL_MODE_POLISH, /BLOCKED/);
  assert.match(FULL_MODE_POLISH, /IN_PROGRESS/);
  assert.match(FULL_MODE_POLISH, /DONE/);
});

test('full mode bounds MEL chat and consults Council before Mentor', () => {
  assert.match(FULL_MODE_POLISH, /22000/);
  assert.match(FULL_MODE_POLISH, /zero-euro-council-fallback/);
  assert.match(FULL_MODE_POLISH, /MEL → Conseil Multi-IA → Mentor/);
  const councilIndex = FULL_MODE_POLISH.indexOf("if(url.includes('/api/gen2/mentor/chat')");
  const callIndex = FULL_MODE_POLISH.indexOf('feedback=await callCouncil', councilIndex);
  const mentorIndex = FULL_MODE_POLISH.indexOf('return nativeFetch(input',{ } );
  assert.ok(councilIndex >= 0 && callIndex > councilIndex);
});

test('generated full mode contains polish runtime after syntax repair', async () => {
  const response = await renderFull({});
  const html = await response.text();
  assert.match(html, /mel-full-polish-runtime/);
  assert.match(html, /x-mel-full-mode-js|MEL/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  assert.ok(scripts.length >= 2);
  scripts.forEach((source, index) => assert.doesNotThrow(() => new Function(source), `inline script ${index} must compile`));
});
