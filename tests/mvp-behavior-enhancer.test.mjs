import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceMvpBehavior, MVP_BEHAVIOR_PATCH } from '../src/pages/mvp-behavior-enhancer.js';
import { buildMelIdentityPrompt } from '../src/identity/mel-persona.js';

test('MVP behavior enhancer injects continuation and bounded zero-euro chat fallback', async () => {
  const source = new Response('<html><body><textarea id="input"></textarea><div id="messages"></div><button id="send">Envoyer</button></body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const enhanced = await enhanceMvpBehavior(source);
  const html = await enhanced.text();
  assert.match(html, /Continuer depuis la dernière phrase/);
  assert.match(html, /CHAT_TIMEOUT_MS=25000/);
  assert.match(html, /zeroEuroFallback/);
  assert.match(html, /\/api\/gen2\/augmentio\/fanout/);
  assert.match(html, /zero-euro-council-fallback/);
  assert.match(html, /502,503,504/);
  assert.doesNotMatch(html, /Audit MEL|installAudit|melAuditRefresh/);
});

test('MVP behavior enhancer is idempotent and ignores non-html responses', async () => {
  const first = await enhanceMvpBehavior(new Response('<html><body><textarea id="input"></textarea></body></html>', { headers: { 'content-type': 'text/html' } }));
  const second = await enhanceMvpBehavior(first);
  const html = await second.text();
  assert.equal((html.match(/mel-mvp-behavior-runtime/g) || []).length, 1);
  const json = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  assert.equal(await (await enhanceMvpBehavior(json)).text(), '{"ok":true}');
});

test('MVP behavior patch normalizes Adrien and strips obsolete normal controls', () => {
  assert.match(MVP_BEHAVIOR_PATCH, /replace\(\/\^Vous\/i,'Adrien'\)/);
  assert.match(MVP_BEHAVIOR_PATCH, /removeRedundantNormalMode/);
  assert.match(MVP_BEHAVIOR_PATCH, /melReadingsToday/);
});

test('MEL persona permanently tutoyers Adrien and treats capability manifest as operational memory', () => {
  const prompt = buildMelIdentityPrompt();
  assert.match(prompt, /Adrien/);
  assert.match(prompt, /tutoies toujours/);
  assert.match(prompt, /CAPABILITY_MANIFEST/);
  assert.match(prompt, /mémoire opérationnelle/);
});
