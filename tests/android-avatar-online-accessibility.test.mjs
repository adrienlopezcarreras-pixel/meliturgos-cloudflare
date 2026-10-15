import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=readFileSync('android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt','utf8');

test('Compose avatar exposes current online/offline state to accessibility services',()=>{
  const start=src.indexOf('private fun MelAvatar(');
  assert.ok(start>=0, 'MelAvatar composable missing');
  const avatar=src.slice(start,start+3200);
  assert.match(avatar,/online:\s*Boolean/);
  assert.match(avatar,/\.semantics\s*\{\s*contentDescription\s*=\s*if\s*\(online\)/);
  assert.match(avatar,/Avatar MEL, connecté/);
  assert.match(avatar,/Avatar MEL, déconnecté/);
  assert.doesNotMatch(avatar,/\.semantics\s*\{\s*contentDescription\s*=\s*"Avatar MEL"\s*\}/);
});
