import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequestGet as normalPage } from '../src/pages/mvp-interface-v3.js';
import { onRequestGet as fullPage } from '../src/pages/full-interface-v2.js';
import { hardenResponseHeaders } from '../src/visual-final-entry.js';

test('site responses receive baseline browser security headers', async () => {
  const response = hardenResponseHeaders(new Response('<!doctype html><title>x</title>', {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  }));
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('strict-transport-security') || '', /max-age=31536000/);
  assert.match(response.headers.get('permissions-policy') || '', /microphone=\(self\)/);
  const csp = response.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('normal mode has a document heading and explicit names for composer/file controls', async () => {
  const html = await (await normalPage({ env:{}, request:new Request('https://audit.local/'), params:{} })).text();
  assert.match(html, /<h1 class="sr-only">MEL — assistant personnel<\/h1>/);
  assert.match(html, /id="promptInput" aria-label="Message à MEL"/);
  assert.match(html, /id="fileInput" type="file" multiple aria-label="Ajouter des fichiers"/);
});

test('full mode critical interactive fields expose explicit accessible names', async () => {
  const html = await (await fullPage({ env:{}, request:new Request('https://audit.local/professor'), params:{} })).text();
  for (const label of [
    'Message à MEL',
    'Filtrer la feuille de route par statut',
    'Filtrer la feuille de route par priorité',
    'Mission de la réunion multi-IA',
    'Nombre de modèles à consulter',
    'Modèle professeur',
    'Objectif de développement',
    'Importer une archive ChatGPT',
    'Ordinateur appairé',
    'Texte à saisir sur l’ordinateur',
  ]) assert.ok(html.includes(`aria-label="${label}"`), label);
});

test('active tree no longer carries historical worker snapshots', () => {
  assert.equal(fs.existsSync('backups'), false);
  assert.equal(fs.existsSync('worker.js.backup-p2'), false);
  assert.equal(fs.existsSync('worker.js.backup-stable'), false);
  assert.equal(fs.existsSync('worker.js.mvp-fix-20260908-195049'), false);
});

test('professor visual ownership is canonical and legacy UI patch layers are retired', async () => {
  const html = await (await fullPage({ env:{}, request:new Request('https://audit.local/professor'), params:{} })).text();
  assert.match(html, /id="learningMeter"/);
  assert.match(html, /id="mel-control-center-runtime"/);
  assert.match(html, /\/assets\/avatars\/mel-full\.webp/);
  const learningSource = fs.readFileSync('src/learning-entry.js','utf8');
  const liveSource = fs.readFileSync('src/professor-live-learning-entry.js','utf8');
  assert.doesNotMatch(learningSource, /learningMeter|mel-control-center-runtime|injectLearningProgressWidget|injectControlCenter/);
  assert.doesNotMatch(liveSource, /import app from ['\"]\.\/ui-release-fix-entry\.js['\"]/);
  assert.equal(fs.existsSync('src/ui-release-fix-entry.js'), false);
});
