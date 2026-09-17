import test from 'node:test';
import assert from 'node:assert/strict';

import { getMelAvatarRoute, serveMelAvatar } from '../src/pages/mel-avatar-assets.js';

test('final Croise and Diablo backgrounds are embedded JPEG assets', async () => {
  for (const path of [
    '/assets/backgrounds/mel-bg-crusade-final.jpg',
    '/assets/backgrounds/mel-bg-diablo-final.jpg',
  ]) {
    const response = serveMelAvatar(path);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 5000);
    assert.deepEqual([...bytes.slice(0, 3)], [0xff, 0xd8, 0xff]);
  }
});

test('Aviation and Paladin backgrounds remain repository-owned WebP assets', async () => {
  for (const path of [
    '/assets/backgrounds/mel-bg-aviation.webp',
    '/assets/backgrounds/mel-bg-paladin.webp',
  ]) {
    const response = serveMelAvatar(path);
    assert.ok(response instanceof Response);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WEBP');
  }
});

test('Futuriste resolves to the exact shared full-mode avatar asset', () => {
  assert.equal(getMelAvatarRoute('futuristic'), '/assets/avatars/mel-full.webp');
});
