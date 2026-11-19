import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('clickable full-mode avatar exposes mode normal and mode workshop', async () => {
  const response = await onRequestGet({request: new Request('https://mel.example/professor')});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<summary id="melModeSwitcher" aria-label="Changer de mode MEL">/);
  assert.match(html, /<div class="mel-mode-menu" aria-label="Modes MEL">/);
  assert.match(html, /<a href="\/">Mode normal<\/a>/);
  assert.match(html, /<a href="\/professor\?mode=workshop">Mode Workshop<\/a>/);
  assert.match(html, /<nav class="nav" id="nav">/);
  const moreMenu = html.match(/<div id="mobileMoreMenu"[^>]*>(.*?)<\/div>/s)?.[1];
  assert.match(moreMenu, /<a class="nav-link mobile-mode-link" href="\/">Mode normal<\/a>/);
  assert.match(moreMenu, /<a class="nav-link mobile-mode-link" href="\/professor\?mode=workshop">Mode Workshop<\/a>/);
});

test('workshop choice reaches a clear, non-operational placeholder, not an external app', async () => {
  const response = await onRequestGet({request: new Request('https://mel.example/professor?mode=workshop')});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>Mode Workshop<\/h1>/);
  for (const label of ['ÉDITEUR','MÉDIA','PROMOTION','MEL Companion']) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /Intégration en cours/);
  assert.match(html, /Moteur non connecté/);
  assert.doesNotMatch(html, /<form|<iframe|window\.open|<script/i);
  assert.match(html, /href="\/professor">Mode complet<\/a>/);
  assert.match(html, /href="\/">Mode normal<\/a>/);
});

test('unknown mode preserves existing full interface', async () => {
  const response = await onRequestGet({request: new Request('https://mel.example/professor?mode=unknown')});
  const html = await response.text();
  assert.match(html, /Mode complet/);
  assert.match(html, /id="nav"/);
});

test('primary full-mode navigation remains the first nav block for legacy audit tools', async () => {
  const response = await onRequestGet({request: new Request('https://mel.example/professor')});
  const html = await response.text();
  const firstNavStart = html.indexOf('<nav ');
  const firstNavEnd = html.indexOf('</nav>', firstNavStart);
  assert.ok(firstNavStart >= 0 && firstNavEnd > firstNavStart);
  const primaryNav = html.slice(firstNavStart, firstNavEnd);
  for (const view of ['overview', 'chat', 'lora', 'computer', 'terminal']) {
    assert.ok(primaryNav.includes('data-view="' + view + '"'), view);
  }
  const workshopResponse = await onRequestGet({request: new Request('https://mel.example/professor?mode=workshop')});
  const workshopHtml = await workshopResponse.text();
  assert.match(workshopHtml, /aria-label="Changer de mode MEL"/);
  assert.match(workshopHtml, /Mode normal/);
});
