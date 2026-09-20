import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getMelAvatarRoute } from '../src/pages/mel-avatar-assets.js';

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

function assetFile(path) {
  return new URL('../dist' + path, import.meta.url);
}

test('clean MEL background pack is deployed as repository-owned JPEG Static Assets', async () => {
  for (const path of BACKGROUNDS) {
    const bytes = new Uint8Array(await readFile(assetFile(path)));
    assert.ok(bytes.length > 5000, path);
    assert.deepEqual([...bytes.slice(0, 3)], [0xff, 0xd8, 0xff], path);
  }
});

test('Futuriste resolves to the exact shared full-mode avatar Static Asset', async () => {
  const path = getMelAvatarRoute('futuristic');
  assert.equal(path, '/assets/avatars/mel-full.webp');
  const bytes = new Uint8Array(await readFile(assetFile(path)));
  assert.ok(bytes.length > 3000);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WEBP');
});
