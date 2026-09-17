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
];

async function html(response) {
  assert.equal(response.status, 200);
  return response.text();
}

test('normal mode has exactly one canonical visual owner and the eight owner themes', async () => {
  const source = await normalPage({});
  const body = await html(await finalizeVisualResponse(source, '/'));

  assert.equal((body.match(/id="mel-normal-canonical-visuals"/g) || []).length, 1);
  assert.equal((body.match(/id="mel-normal-canonical-runtime"/g) || []).length, 1);
  for (const id of LEGACY_IDS) assert.equal(body.includes(`id="${id}"`), false, `${id} must be stripped`);

  for (const label of [
    'Normal · Bibliothèque',
    'Granada · Cathédrale',
    'Guadix · Virgen de Gracia',
    'Croisé · Jérusalem',
    'Aviation · Années 40',
    'Diablo · Camp des Amazones',
    'Paladin · Pandemonium',
    'Futuriste',
  ]) assert.ok(body.includes(label), `theme missing: ${label}`);

  assert.match(body, /avatar-wrap::before,.avatar-wrap::after,.avatar::before,.avatar::after\{display:none!important/);
  assert.match(body, /\.avatar>img~img\{display:none!important\}/);
  assert.match(body, /\[\.\.\.avatar\.querySelectorAll\('img'\)\]\.forEach\(\(node,index\)=>\{if\(index>0\)node\.remove\(\)\}\)/);
});

test('Professor receives no normal-mode theme system', async () => {
  const source = await professorPage({});
  const body = await html(await finalizeVisualResponse(source, '/professor'));

  assert.equal(body.includes('mel-normal-canonical-visuals'), false);
  assert.equal(body.includes('mel-normal-canonical-runtime'), false);
  assert.equal(body.includes('Normal · Bibliothèque'), false);
  assert.equal(body.includes('Guadix · Virgen de Gracia'), false);
  assert.equal(body.includes('Diablo · Camp des Amazones'), false);
  assert.equal(body.includes('data-mel-theme-choice'), false);
  for (const id of LEGACY_IDS) assert.equal(body.includes(`id="${id}"`), false, `${id} must not reach Professor`);
});
