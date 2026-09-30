import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEL_THEME_PRESENTATIONS,
  MEL_VISUAL_IDENTITY,
  MEL_VISUAL_IDENTITY_SCHEMA,
  getMelVisualIdentity,
} from '../../src/pages/avatar-identity.js';
import { getMelAvatarPresentation } from '../../src/pages/mel-avatar-assets.js';

test('MEL-AVATAR-03 defines one canonical identity independent from costume', () => {
  assert.equal(MEL_VISUAL_IDENTITY_SCHEMA,'mel.visual-identity.v1');
  assert.equal(MEL_VISUAL_IDENTITY.id,'mel-canonical');
  assert.equal(MEL_VISUAL_IDENTITY.name,'MEL');
  assert.equal(MEL_VISUAL_IDENTITY.defaults.theme,'futuristic');
  assert.equal(MEL_VISUAL_IDENTITY.defaults.avatar,'/assets/avatars/mel-full.webp');
  assert.equal(MEL_VISUAL_IDENTITY.continuity.personality,'same-mel-across-themes');
});

test('MEL-AVATAR-03 all eight themes resolve to the same identity id', () => {
  const themes=Object.keys(MEL_THEME_PRESENTATIONS);
  assert.equal(themes.length,8);
  const ids=new Set(themes.map(theme=>getMelVisualIdentity(theme).identity_id));
  assert.deepEqual([...ids],['mel-canonical']);
});

test('MEL-AVATAR-03 treats costume/context as presentation metadata only', () => {
  const futuristic=getMelVisualIdentity('futuristic');
  const classic=getMelVisualIdentity('classic');
  assert.equal(futuristic.identity_id,classic.identity_id);
  assert.notEqual(futuristic.presentation.outfit,classic.presentation.outfit);
  assert.equal(futuristic.presentation.outfit,'modern-neutral');
  assert.equal(classic.presentation.outfit,'library');
});

test('MEL-AVATAR-03 unknown theme falls back to modern neutral identity', () => {
  const identity=getMelVisualIdentity('unknown');
  assert.equal(identity.theme,'futuristic');
  assert.equal(identity.identity_id,'mel-canonical');
  assert.equal(identity.presentation.outfit,'modern-neutral');
});

test('avatar presentation combines route and canonical identity without coupling identity to route', () => {
  const classic=getMelAvatarPresentation('classic');
  const futuristic=getMelAvatarPresentation('futuristic');
  assert.equal(classic.identity.identity_id,futuristic.identity.identity_id);
  assert.notEqual(classic.route,futuristic.route);
});
