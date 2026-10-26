import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windowsCompanionRecentlyOpen } from '../../src/devices/computer-companion-api.js';
import { stressDrainContinues } from '../../src/diagnostics/persistent-capability-stress.js';
import { MEL_REAL_CAPABILITIES } from '../../src/api/native-chat.js';

test('a fresh Windows heartbeat means the PC is open', async () => {
  const db = { prepare() { return { async first() { return { last_seen_at: 1_000, halted: 0 }; } }; } };
  assert.equal(await windowsCompanionRecentlyOpen({ DB: db }, 31_000), true);
  assert.equal(await windowsCompanionRecentlyOpen({ DB: db }, 130_000), false);
  const halted = { prepare() { return { async first() { return { last_seen_at: 1_000, halted: 1 }; } }; } };
  assert.equal(await windowsCompanionRecentlyOpen({ DB: halted }, 2_000), false);
  assert.equal(await windowsCompanionRecentlyOpen({}, 2_000), false);
});

test('an open PC keeps draining a queued capability audit and stops when it is finished', () => {
  assert.equal(stressDrainContinues({ status: 'QUEUED', resumed: true }), true);
  assert.equal(stressDrainContinues({ status: 'COMPLETE', resumed: true }), false);
  assert.equal(stressDrainContinues({ skipped: true, reason: 'NO_ACTIVE_CAPABILITY_STRESS' }), false);
  assert.equal(stressDrainContinues({ status: 'QUEUED', resumed: false }), false);
  const source = readFileSync(new URL('../../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /windowsCompanionRecentlyOpen/);
  assert.match(source, /drainOpenPcCapabilityStress/);
  assert.match(source, /runSelfAudit\('MONTHLY', \{ forceLevel: 'MONTHLY', candidateLimit: 1000 \}\)/);
  assert.match(source, /runSelfAudit\('HEARTBEAT'\)/);
  assert.match(source, /runSelfAudit\('MONTHLY'\)/);
});

test('MEL is told about Google formats, the chat objective list and the open-PC audit', () => {
  assert.match(MEL_REAL_CAPABILITIES, /drive\.files\.create/);
  assert.match(MEL_REAL_CAPABILITIES, /SVG vectoriel libre/);
  assert.match(MEL_REAL_CAPABILITIES, /Google Sheet/);
  assert.match(MEL_REAL_CAPABILITIES, /encart fixe/);
  assert.match(MEL_REAL_CAPABILITIES, /sans plafond de chunk/);
});
