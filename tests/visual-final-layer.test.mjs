import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet as normalPage } from '../src/pages/mvp-interface.js';
import { onRequestGet as professorPage } from '../src/pages/full-interface-v2.js';
import { finalizeVisualResponse } from '../src/visual-final-entry.js';

const LEGACY_IDS = [
  'mel-owner-visual-fix',
  'mel-new-hd-scenes',
  'mel-normal-release-runtime',
  'mel-normal-page-cleanup',
  'mel-theme-decor-style',
  'mel-theme-avatar-runtime',
  'mel-normal-canonical-visuals',
  'mel-normal-canonical-runtime',
];

const CLEAN_ASSETS = [
  '/assets/backgrounds/mel-bg-library-hd.jpg',
  '/assets/backgrounds/mel-bg-granada-cathedral-hd.jpg',
  '/assets/backgrounds/mel-bg-guadix-virgen-gracia-hd.jpg',
  '/assets/backgrounds/mel-bg-crusade-jerusalem-hd.jpg',
  '/assets/backgrounds/mel-bg-aviation-1940-hd.jpg',
  '/assets/backgrounds/mel-bg-amazon-act1-hd.jpg',
  '/assets/backgrounds/mel-bg-paladin-act4-hd.jpg',
  '/assets/backgrounds/mel-bg-futuristic-hd.jpg',
  '/assets/avatars/mel-classic.webp',
  '/assets/avatars/mel-granada.webp',
  '/assets/avatars/mel-religious-andalusian.webp',
  '/assets/avatars/mel-crusade.webp',
  '/assets/avatars/mel-aviation-1940s.webp',
  '/assets/avatars/mel-amazon-griffon.webp',
  '/assets/avatars/mel-paladin-light-full-plate.webp',
  '/assets/avatars/mel-full.webp',
];

async function html(response) {
  assert.equal(response.status, 200);
  return response.text();
}

test('normal mode has exactly one canonical visual owner and the clean eight-theme pack', async () => {
  const source = await normalPage({});
  const body = await html(await finalizeVisualResponse(source, '/'));

  assert.match(body, /data-visual-owner="mel-normal-v3"/);
  assert.equal((body.match(/id="mel-normal-v3-style"/g) || []).length, 1);
  assert.equal((body.match(/src="\/normal-runtime\.js\?v=8"/g) || []).length, 1);
  assert.equal((body.match(/id="melAvatarImage"/g) || []).length, 1);
  for (const id of LEGACY_IDS) assert.equal(body.includes('id="' + id + '"'), false, id + ' must be absent');

  for (const label of [
    'Bibliothèque',
    'Granada · Cathédrale',
    'Guadix · Virgen de Gracia',
    'Croisés · Jérusalem',
    'Aviation · 1940',
    'Diablo · Amazone · Acte I',
    'Diablo · Paladin · Acte IV',
    'Futuriste',
  ]) assert.ok(body.includes(label), 'theme missing: ' + label);

  assert.ok(body.includes('border-radius:50%;overflow:hidden'));
  assert.ok(body.includes('object-fit:cover;object-position:var(--avatar-pos);transform:none;border-radius:50%;clip-path:circle(50%)'));
  assert.ok(body.includes('data-mel-theme-choice="futuristic" data-mel-avatar="/assets/avatars/mel-full.webp"'));

  for (const asset of CLEAN_ASSETS) assert.ok(body.includes(asset), 'clean asset missing: ' + asset);
});

test('Professor receives no normal-mode theme system and shares the full avatar with Futuriste', async () => {
  const source = await professorPage({});
  const body = await html(await finalizeVisualResponse(source, '/professor'));

  assert.equal(body.includes('mel-normal-v3-style'), false);
  assert.equal(body.includes('/normal-runtime.js'), false);
  assert.equal(body.includes('data-visual-owner="mel-normal-v3"'), false);
  assert.equal(body.includes('Guadix · Virgen de Gracia'), false);
  assert.equal(body.includes('Diablo · Amazone · Acte I'), false);
  assert.equal(body.includes('data-mel-theme-choice'), false);
  assert.ok(body.includes('/assets/avatars/mel-full.webp'));
  assert.equal(body.includes('/meliturgos-avatar-fille.png'), false);
  for (const id of LEGACY_IDS) assert.equal(body.includes('id="' + id + '"'), false, id + ' must not reach Professor');
});
