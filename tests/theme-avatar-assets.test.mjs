import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderNormalMode } from '../src/pages/mvp-interface-v3.js';

const AVATARS = [
  ['classic', '/assets/avatars/mel-classic.webp', 'avatarClassic'],
  ['granada', '/assets/avatars/mel-granada.webp', 'avatarGranada'],
  ['guadix', '/assets/avatars/mel-religious-andalusian.webp', 'avatarGuadix'],
  ['crusade', '/assets/avatars/mel-crusade.webp', 'avatarCrusade'],
  ['aviation', '/assets/avatars/mel-aviation-1940s.webp', 'avatarAviation'],
  ['amazon', '/assets/avatars/mel-amazon-griffon.webp', 'avatarAmazon'],
  ['paladin', '/assets/avatars/mel-paladin-light-full-plate.webp', 'avatarPaladin'],
  ['futuristic', '/assets/avatars/mel-full.webp', 'avatarFuturistic'],
];


test('clean Static Asset portraits remain byte-distinct', async () => {
  const hashes = [];
  for (const [, path] of AVATARS) {
    const bytes = await readFile(new URL('../dist' + path, import.meta.url));
    hashes.push(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(new Set(hashes).size, AVATARS.length);
});


