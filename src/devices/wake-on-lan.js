export const WAKE_ON_LAN_SCHEMA = 'mel.devices.wake-on-lan.v1';

const DEFAULT_BROADCAST = '255.255.255.255';
const DEFAULT_PORT = 9;
const ALLOWED_PORTS = new Set([7, 9]);
const MAX_ID = 200;

function text(value, max = MAX_ID) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeMacAddress(value) {
  const compact = text(value, 64).replace(/[.:-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) return null;
  return compact.match(/.{2}/g).join(':');
}

function parseIpv4(value) {
  const raw = text(value, 64);
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(part => Number(part));
  if (octets.some((octet, index) => !Number.isInteger(octet) || octet < 0 || octet > 255 || String(octet) !== parts[index])) {
    return null;
  }
  return octets;
}

export function isAllowedBroadcastAddress(value) {
  if (value === DEFAULT_BROADCAST) return true;
  const octets = parseIpv4(value);
  if (!octets || octets[3] !== 255) return false;
  const [a, b] = octets;
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

export function buildMagicPacket(macAddress) {
  const mac = normalizeMacAddress(macAddress);
  if (!mac) throw wolError('INVALID_MAC_ADDRESS');
  const macBytes = mac.split(':').map(part => Number.parseInt(part, 16));
  const packet = new Uint8Array(6 + 16 * macBytes.length);
  packet.fill(0xff, 0, 6);
  for (let repeat = 0; repeat < 16; repeat += 1) {
    packet.set(macBytes, 6 + repeat * macBytes.length);
  }
  return packet;
}

export function magicPacketToHex(packet) {
  if (!(packet instanceof Uint8Array) || packet.length !== 102) {
    throw wolError('INVALID_MAGIC_PACKET');
  }
  return [...packet].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function normalizeWakeOnLanRequest(input = {}) {
  const port = Number(input.port ?? DEFAULT_PORT);
  return {
    schema: WAKE_ON_LAN_SCHEMA,
    session_id: text(input.session_id),
    owner_halt: input.owner_halt === true,
    device: {
      id: text(input.device?.id),
      capabilities: Array.isArray(input.device?.capabilities)
        ? [...new Set(input.device.capabilities.map(item => text(item, 120)).filter(Boolean))]
        : [],
    },
    target: {
      mac: normalizeMacAddress(input.mac),
      broadcast: text(input.broadcast, 64) || DEFAULT_BROADCAST,
      port: Number.isInteger(port) ? port : DEFAULT_PORT,
    },
    approval: {
      approved: input.approval?.approved === true,
      session_id: text(input.approval?.session_id),
      device_id: text(input.approval?.device_id),
      mac: normalizeMacAddress(input.approval?.mac),
      action: text(input.approval?.action, 80),
    },
  };
}

function approvalMatches(request) {
  const { approval, session_id: sessionId, device, target } = request;
  return approval.approved === true
    && approval.action === 'WAKE_ON_LAN'
    && approval.session_id === sessionId
    && approval.device_id === device.id
    && approval.mac === target.mac;
}

/**
 * MEL-DEVICE-03 policy gate.
 *
 * This module only prepares an approved LAN wake request. It never opens a
 * socket itself. An injected companion/network adapter is the only component
 * allowed to transmit the packet.
 */
export function evaluateWakeOnLanRequest(input = {}) {
  const request = normalizeWakeOnLanRequest(input);

  if (request.owner_halt) return decision(request, false, 'OWNER_HALT_ACTIVE');
  if (!request.session_id || !request.device.id) return decision(request, false, 'SESSION_AND_DEVICE_REQUIRED');
  if (!request.device.capabilities.includes('wake.on_lan')) return decision(request, false, 'WAKE_ON_LAN_CAPABILITY_REQUIRED');
  if (!request.target.mac) return decision(request, false, 'VALID_MAC_REQUIRED');
  if (!isAllowedBroadcastAddress(request.target.broadcast)) return decision(request, false, 'PRIVATE_BROADCAST_REQUIRED');
  if (!ALLOWED_PORTS.has(request.target.port)) return decision(request, false, 'WAKE_ON_LAN_PORT_NOT_ALLOWED');
  if (!approvalMatches(request)) return decision(request, false, 'EXPLICIT_WAKE_APPROVAL_REQUIRED');

  return decision(request, true, 'WAKE_AUTHORIZED');
}

export function createWakeOnLanController({
  adapter,
  authorize = async () => false,
  audit = async () => {},
} = {}) {
  if (!adapter || typeof adapter.send !== 'function') throw wolError('WAKE_ON_LAN_ADAPTER_REQUIRED');
  if (typeof authorize !== 'function') throw wolError('WAKE_ON_LAN_AUTHORIZER_REQUIRED');
  if (typeof audit !== 'function') throw wolError('WAKE_ON_LAN_AUDIT_REQUIRED');

  return Object.freeze({
    async wake(input = {}, context = {}) {
      const result = evaluateWakeOnLanRequest(input);
      if (!result.allowed) {
        await audit(auditRow(result, 'DENIED', result.reason));
        throw wolError(result.reason);
      }

      const globallyAuthorized = await authorize('device:wake', {
        ...context,
        sessionId: result.request.session_id,
        deviceId: result.request.device.id,
        mac: result.request.target.mac,
      });
      if (!globallyAuthorized) {
        await audit(auditRow(result, 'DENIED', 'GLOBAL_PERMISSION_DENIED'));
        throw wolError('GLOBAL_PERMISSION_DENIED');
      }

      const packet = buildMagicPacket(result.request.target.mac);
      const payload = Object.freeze({
        schema: WAKE_ON_LAN_SCHEMA,
        device_id: result.request.device.id,
        mac: result.request.target.mac,
        broadcast: result.request.target.broadcast,
        port: result.request.target.port,
        packet_hex: magicPacketToHex(packet),
      });

      try {
        const adapterResult = await adapter.send(payload, {
          ...context,
          sessionId: result.request.session_id,
          deviceId: result.request.device.id,
        });
        await audit(auditRow(result, 'SENT', 'OK'));
        return {
          schema: WAKE_ON_LAN_SCHEMA,
          ok: true,
          request: payload,
          adapter_result: adapterResult ?? null,
        };
      } catch (error) {
        const code = text(error?.code || error?.name || 'WAKE_ADAPTER_FAILURE', 100) || 'WAKE_ADAPTER_FAILURE';
        await audit(auditRow(result, 'FAILED', code));
        throw wolError(code);
      }
    },
  });
}

function decision(request, allowed, reason) {
  return Object.freeze({ schema: WAKE_ON_LAN_SCHEMA, allowed, reason, request });
}

function auditRow(result, status, reason) {
  return {
    kind: 'WAKE_ON_LAN_AUDIT',
    schema: WAKE_ON_LAN_SCHEMA,
    session_id: result.request.session_id || null,
    device_id: result.request.device.id || null,
    mac: result.request.target.mac || null,
    broadcast: result.request.target.broadcast,
    port: result.request.target.port,
    status,
    reason,
  };
}

function wolError(code) {
  const error = new Error(code);
  error.name = 'WakeOnLanError';
  error.code = code;
  return error;
}
