import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeDeviceAction, boundedDeviceAudit, classifyDeviceAction } from '../src/devices/device-control-policy.js';

const tv = { capabilities: ['media.play', 'volume.up', 'power.off'] };

test('low-risk declared media action is authorized without per-action confirmation', () => {
  assert.deepEqual(authorizeDeviceAction({ device: tv, action: 'media.play' }), {
    allowed: true, reason: 'AUTHORIZED', tier: 'ALLOW_LOW_RISK'
  });
});

test('sensitive action requires explicit owner confirmation', () => {
  assert.equal(classifyDeviceAction('power.off'), 'CONFIRM');
  assert.deepEqual(authorizeDeviceAction({ device: tv, action: 'power.off' }), {
    allowed: false, reason: 'OWNER_CONFIRMATION_REQUIRED', tier: 'CONFIRM'
  });
  assert.deepEqual(authorizeDeviceAction({ device: tv, action: 'power.off', ownerApproved: true }), {
    allowed: true, reason: 'AUTHORIZED', tier: 'CONFIRM'
  });
});

test('undeclared capability is fail-closed', () => {
  assert.deepEqual(authorizeDeviceAction({ device: tv, action: 'app.install', ownerApproved: true }), {
    allowed: false, reason: 'CAPABILITY_NOT_DECLARED'
  });
});

test('owner shutdown overrides every permission and confirmation', () => {
  assert.deepEqual(authorizeDeviceAction({ device: tv, action: 'media.play', ownerApproved: true, ownerShutdown: true }), {
    allowed: false, reason: 'OWNER_SHUTDOWN'
  });
});

test('unknown declared actions still require confirmation', () => {
  const device = { capabilities: ['vendor.custom'] };
  assert.deepEqual(authorizeDeviceAction({ device, action: 'vendor.custom' }), {
    allowed: false, reason: 'OWNER_CONFIRMATION_REQUIRED', tier: 'CONFIRM'
  });
});

test('audit record is bounded and contains no command payload', () => {
  const audit = boundedDeviceAudit({
    deviceId: 'tv-1', action: 'media.play', adapter: 'android-tv',
    decision: { allowed: true, reason: 'AUTHORIZED', tier: 'ALLOW_LOW_RISK' }
  });
  assert.equal(audit.kind, 'DEVICE_ACTION_AUDIT');
  assert.equal(audit.allowed, true);
  assert.equal(Object.hasOwn(audit, 'payload'), false);
});
