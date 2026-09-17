import test from 'node:test';
import assert from 'node:assert/strict';

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

test('clean MEL background pack is embedded as repository-owned JPEG assets', async () => {
  for (const path of BACKGROUNDS) {
    const response = serveMelAvatar(path);
    assert.ok(response instanceof Response, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'image/jpeg', path);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 5000, path);
    assert.deepEqual([...bytes.slice(0, 3)], [0xff, 0xd8, 0xff], path);
  }
});

test('Futuriste resolves to the exact shared full-mode avatar asset', () => {
  assert.equal(getMelAvatarRoute('futuristic'), '/assets/avatars/mel-full.webp');
  const response = serveMelAvatar('/assets/avatars/mel-full.webp');
  assert.ok(response instanceof Response);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('x-mel-asset'), 'avatarFuturistic');
});
