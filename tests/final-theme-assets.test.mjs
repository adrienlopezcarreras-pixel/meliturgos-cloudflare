import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import { getMelAvatarRoute, serveMelAvatar } from '../src/pages/mel-avatar-assets.js';

const BACKGROUNDS = [
  '/assets/backgrounds/mel-bg-library-hd.jpg',
  '/assets/backgrounds/mel-bg-granada-cathedral-hd.jpg',
  '/assets/backgrounds/mel-bg-guadix-virgen-gracia-hd.jpg',
  '/assets/backgrounds/mel-bg-crusade-jerusalem-hd.jpg',
  '/assets/backgrounds/mel-bg-aviation-1940-hd.jpg',
  '/assets/backgrounds/mel-bg-amazon-act1-hd.jpg',
  '/assets/backgrounds/mel-bg-paladin-act4-hd.jpg',
  '/assets/backgrounds/mel-bg-futuristic-hd.jpg',
];

function staticAssetUrl(route) {
  return new URL('../dist' + route, import.meta.url);
}

test('clean MEL background pack is deployed as repository-owned static JPEG assets', async () => {
  for (const path of BACKGROUNDS) {
    const url = staticAssetUrl(path);
    const info = await stat(url);
    assert.ok(info.size > 10000, path);
    const bytes = await readFile(url);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], path);
  }
});

test('Futuriste resolves to the exact shared full-mode static avatar asset', async () => {
  const path = '/assets/avatars/mel-full.webp';
  assert.equal(getMelAvatarRoute('futuristic'), path);
  const bytes = await readFile(staticAssetUrl(path));
  assert.ok(bytes.length > 10000);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(serveMelAvatar(path), null);
});
