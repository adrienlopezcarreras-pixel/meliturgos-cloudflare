import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

function ctx() {
  return { owner: 'test-owner', permissions: [], requestId: crypto.randomUUID() };
}

test('capability.audit inventories the complete current runtime without executing medium-risk capabilities', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const report = await runtime.bus.execute('capability.audit', { deep: false }, ctx());
  assert.equal(report.ok, true);
  assert.equal(report.total, runtime.bus.list().length);
  const ids = new Set(report.capabilities.map(row => row.id));
  for (const id of ['capability.audit','mentor.propose','mentor.learn','mentor.recent','device.policy.preview','evolution.enqueue','autonomy.status']) {
    assert.ok(ids.has(id), `audit missing ${id}`);
  }
  assert.equal(report.capabilities.find(row => row.id === 'evolution.enqueue').tested_now, false);
  assert.equal(report.capabilities.find(row => row.id === 'mentor.learn').tested_now, false);
});

test('device.policy.preview never executes a command and keeps sensitive actions fail-closed', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const safe = await runtime.bus.execute('device.policy.preview', {
    deviceId: 'tv-1',
    capabilities: ['media.play', 'power.off'],
    action: 'media.play',
    adapter: 'android-tv',
  }, ctx());
  assert.equal(safe.executed, false);
  assert.equal(safe.decision.allowed, true);
  assert.equal(safe.classification, 'ALLOW_LOW_RISK');

  const sensitive = await runtime.bus.execute('device.policy.preview', {
    deviceId: 'tv-1',
    capabilities: ['media.play', 'power.off'],
    action: 'power.off',
  }, ctx());
  assert.equal(sensitive.executed, false);
  assert.equal(sensitive.decision.allowed, false);
  assert.equal(sensitive.decision.reason, 'OWNER_CONFIRMATION_REQUIRED');
  assert.equal(sensitive.audit.allowed, false);
});

test('device policy owner shutdown overrides even a low-risk action', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const result = await runtime.bus.execute('device.policy.preview', {
    deviceId: 'speaker-1',
    capabilities: ['volume.up'],
    action: 'volume.up',
    ownerShutdown: true,
  }, ctx());
  assert.equal(result.executed, false);
  assert.equal(result.decision.allowed, false);
  assert.equal(result.decision.reason, 'OWNER_SHUTDOWN');
});
