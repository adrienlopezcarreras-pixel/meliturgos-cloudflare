import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WAKE_ON_LAN_SCHEMA,
  buildMagicPacket,
  createWakeOnLanController,
  evaluateWakeOnLanRequest,
  isAllowedBroadcastAddress,
  magicPacketToHex,
  normalizeMacAddress,
  normalizeWakeOnLanRequest,
} from '../../src/devices/wake-on-lan.js';

const base = {
  session_id: 'session-1',
  device: { id: 'pc-1', capabilities: ['wake.on_lan'] },
  mac: '00:11:22:33:44:55',
  broadcast: '192.168.1.255',
  port: 9,
  approval: {
    approved: true,
    action: 'WAKE_ON_LAN',
    session_id: 'session-1',
    device_id: 'pc-1',
    mac: '00:11:22:33:44:55',
  },
};

test('MEL-DEVICE-03 normalizes common MAC formats', () => {
  assert.equal(normalizeMacAddress('00:11:22:33:44:55'), '00:11:22:33:44:55');
  assert.equal(normalizeMacAddress('00-11-22-33-44-55'), '00:11:22:33:44:55');
  assert.equal(normalizeMacAddress('0011.2233.4455'), '00:11:22:33:44:55');
  assert.equal(normalizeMacAddress('001122334455'), '00:11:22:33:44:55');
  assert.equal(normalizeMacAddress('not-a-mac'), null);
});

test('MEL-DEVICE-03 builds the canonical 102-byte magic packet', () => {
  const packet = buildMagicPacket('00:11:22:33:44:55');
  assert.equal(packet.length, 102);
  assert.deepEqual([...packet.slice(0, 6)], [255, 255, 255, 255, 255, 255]);
  const mac = [0, 17, 34, 51, 68, 85];
  for (let offset = 6; offset < packet.length; offset += 6) {
    assert.deepEqual([...packet.slice(offset, offset + 6)], mac);
  }
  const hex = magicPacketToHex(packet);
  assert.equal(hex.length, 204);
  assert.ok(hex.startsWith('FFFFFFFFFFFF001122334455001122334455'));
});

test('MEL-DEVICE-03 restricts transmission to private or global broadcast addresses', () => {
  assert.equal(isAllowedBroadcastAddress('255.255.255.255'), true);
  assert.equal(isAllowedBroadcastAddress('10.0.0.255'), true);
  assert.equal(isAllowedBroadcastAddress('172.16.2.255'), true);
  assert.equal(isAllowedBroadcastAddress('172.31.255.255'), true);
  assert.equal(isAllowedBroadcastAddress('192.168.1.255'), true);
  assert.equal(isAllowedBroadcastAddress('8.8.8.255'), false);
  assert.equal(isAllowedBroadcastAddress('192.168.1.12'), false);
  assert.equal(isAllowedBroadcastAddress('192.168.001.255'), false);
});

test('MEL-DEVICE-03 fails closed without identity, capability, MAC or explicit approval', () => {
  assert.equal(evaluateWakeOnLanRequest({}).reason, 'SESSION_AND_DEVICE_REQUIRED');

  const noCapability = evaluateWakeOnLanRequest({
    ...base,
    device: { id: 'pc-1', capabilities: [] },
  });
  assert.equal(noCapability.allowed, false);
  assert.equal(noCapability.reason, 'WAKE_ON_LAN_CAPABILITY_REQUIRED');

  const invalidMac = evaluateWakeOnLanRequest({ ...base, mac: 'nope' });
  assert.equal(invalidMac.allowed, false);
  assert.equal(invalidMac.reason, 'VALID_MAC_REQUIRED');

  const noApproval = evaluateWakeOnLanRequest({ ...base, approval: null });
  assert.equal(noApproval.allowed, false);
  assert.equal(noApproval.reason, 'EXPLICIT_WAKE_APPROVAL_REQUIRED');
});

test('MEL-DEVICE-03 owner halt always wins', () => {
  const result = evaluateWakeOnLanRequest({ ...base, owner_halt: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'OWNER_HALT_ACTIVE');
});

test('MEL-DEVICE-03 approval is scoped to session, device and MAC', () => {
  const wrongSession = evaluateWakeOnLanRequest({
    ...base,
    approval: { ...base.approval, session_id: 'other-session' },
  });
  assert.equal(wrongSession.allowed, false);

  const wrongDevice = evaluateWakeOnLanRequest({
    ...base,
    approval: { ...base.approval, device_id: 'other-pc' },
  });
  assert.equal(wrongDevice.allowed, false);

  const wrongMac = evaluateWakeOnLanRequest({
    ...base,
    approval: { ...base.approval, mac: 'AA:BB:CC:DD:EE:FF' },
  });
  assert.equal(wrongMac.allowed, false);

  const allowed = evaluateWakeOnLanRequest(base);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, 'WAKE_AUTHORIZED');
});

test('MEL-DEVICE-03 only permits standard WOL UDP ports', () => {
  assert.equal(evaluateWakeOnLanRequest({ ...base, port: 7 }).allowed, true);
  const denied = evaluateWakeOnLanRequest({ ...base, port: 53 });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'WAKE_ON_LAN_PORT_NOT_ALLOWED');
});

test('MEL-DEVICE-03 normalization keeps the contract deterministic', () => {
  const normalized = normalizeWakeOnLanRequest({
    ...base,
    session_id: ' session-1 ',
    mac: '00-11-22-33-44-55',
    device: { id: ' pc-1 ', capabilities: ['wake.on_lan', 'wake.on_lan'] },
  });
  assert.equal(normalized.schema, WAKE_ON_LAN_SCHEMA);
  assert.equal(normalized.session_id, 'session-1');
  assert.equal(normalized.device.id, 'pc-1');
  assert.deepEqual(normalized.device.capabilities, ['wake.on_lan']);
  assert.equal(normalized.target.mac, '00:11:22:33:44:55');
});

test('MEL-DEVICE-03 controller requires global permission, sends through adapter and audits', async () => {
  const sent = [];
  const audits = [];
  const controller = createWakeOnLanController({
    adapter: {
      async send(payload) {
        sent.push(payload);
        return { delivered: true };
      },
    },
    authorize: async permission => permission === 'device:wake',
    audit: async row => audits.push(row),
  });

  const result = await controller.wake(base);
  assert.equal(result.ok, true);
  assert.equal(result.request.mac, '00:11:22:33:44:55');
  assert.equal(result.request.packet_hex.length, 204);
  assert.equal(sent.length, 1);
  assert.equal(audits.at(-1).status, 'SENT');

  const denied = createWakeOnLanController({
    adapter: { send: async () => assert.fail('adapter must not run') },
    authorize: async () => false,
    audit: async row => audits.push(row),
  });
  await assert.rejects(
    denied.wake(base),
    error => error.code === 'GLOBAL_PERMISSION_DENIED',
  );
  assert.equal(audits.at(-1).status, 'DENIED');
});
