import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseAutonomyPatch } from '../src/legacy/survival-mode.js';

test('post-release proof requests never reapply the owner MAX pause', () => {
  const source = readFileSync(new URL('../src/evolution/release-launch-bootstrap.js', import.meta.url), 'utf8');
  assert.match(source, /const releaseControl = \(phase === 'pause' \|\| phase === 'all'\)\s*\? await setControl\(env\?\.DB, releaseAutonomyPatch\(survival\.active === true\)\)/);
  assert.match(source, /if \(phase === 'pause'\)/);
  assert.doesNotMatch(source, /const releaseControl = await setControl\(env\?\.DB,/);
  assert.equal(releaseAutonomyPatch(false).reason, 'NEW_RELEASE_AWAITING_OWNER_LAUNCH');
  assert.equal(releaseAutonomyPatch(false).paused, true);
});