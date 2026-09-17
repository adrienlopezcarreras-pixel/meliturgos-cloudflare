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

async function html(response) {
  assert.equal(response.status, 200);
  return response.text();
}

test('normal mode has exactly one canonical visual owner and the eight V3 themes', async () => {
  const source = await normalPage({});
  const body = await html(await finalizeVisualResponse(source, '/'));

  assert.match(body, /data-visual-owner="mel-normal-v3"/);
  assert.equal((body.match(/id="mel-normal-v3-style"/g) || []).length, 1);
  assert.equal((body.match(/id="mel-normal-v3-runtime"/g) || []).length, 1);
  assert.equal((body.match(/id="melAvatarImage"/g) || []).length, 1);
  for (const id of LEGACY_IDS) assert.equal(body.includes(`id="${id}"`), false, `${id} must be absent`);

  for (const label of [
    'Bibliothèque',
    'Granada · Cathédrale',
    'Guadix · Virgen de Gracia',
    'Croisés · Jérusalem',
    'Aviation · 1940',
    'Diablo · Amazone · Acte I',
    'Diablo · Paladin · Acte IV',
    'Futuriste',
  ]) assert.ok(body.includes(label), `theme missing: ${label}`);

  assert.ok(body.includes('border-radius:50%;overflow:hidden'));
  assert.ok(body.includes('object-fit:cover;object-position:var(--avatar-pos);transform:none;border-radius:50%;clip-path:circle(50%)'));
  assert.ok(body.includes('"futuristic":"/meliturgos-avatar-fille.png"'));
});

test('Professor receives no normal-mode theme system', async () => {
  const source = await professorPage({});
  const body = await html(await finalizeVisualResponse(source, '/professor'));

  assert.equal(body.includes('mel-normal-v3-style'), false);
  assert.equal(body.includes('mel-normal-v3-runtime'), false);
  assert.equal(body.includes('data-visual-owner="mel-normal-v3"'), false);
  assert.equal(body.includes('Guadix · Virgen de Gracia'), false);
  assert.equal(body.includes('Diablo · Amazone · Acte I'), false);
  assert.equal(body.includes('data-mel-theme-choice'), false);
  for (const id of LEGACY_IDS) assert.equal(body.includes(`id="${id}"`), false, `${id} must not reach Professor`);
});
