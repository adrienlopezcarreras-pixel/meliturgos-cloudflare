import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('post-release proof requests never reapply the owner MAX pause', () => {
  const source = readFileSync(new URL('../src/evolution/release-launch-bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /const releaseControl = phase === 'pause'\s*\? await setControl\(env\?\.DB,/);
  assert.match(source, /reason: 'NEW_RELEASE_AWAITING_OWNER_LAUNCH'/);
  assert.match(source, /if \(phase === 'pause'\)/);
  assert.doesNotMatch(source, /const releaseControl = await setControl\(env\?\.DB,/);
});
