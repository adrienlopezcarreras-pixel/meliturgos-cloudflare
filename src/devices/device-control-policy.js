const SAFE_ACTIONS = new Set([
  'media.play', 'media.pause', 'media.stop', 'media.next', 'media.previous',
  'volume.up', 'volume.down', 'volume.mute', 'navigation.home', 'navigation.back'
]);

const SENSITIVE_ACTIONS = new Set([
  'power.off', 'power.restart', 'app.install', 'app.uninstall',
  'account.change', 'factory.reset', 'system.settings.write'
]);

function normalizedCapabilities(device = {}) {
  const raw = Array.isArray(device.capabilities) ? device.capabilities : [];
  return new Set(raw.map((value) => String(value || '').trim()).filter(Boolean));
}

export function classifyDeviceAction(action) {
  const name = String(action || '').trim();
  if (!name) return 'DENY';
  if (SENSITIVE_ACTIONS.has(name)) return 'CONFIRM';
  if (SAFE_ACTIONS.has(name)) return 'ALLOW_LOW_RISK';
  return 'CONFIRM';
}

export function authorizeDeviceAction({ device, action, ownerApproved = false, ownerShutdown = false } = {}) {
  const name = String(action || '').trim();
  if (ownerShutdown) return { allowed: false, reason: 'OWNER_SHUTDOWN' };
  if (!device || !name) return { allowed: false, reason: 'INVALID_REQUEST' };

  const capabilities = normalizedCapabilities(device);
  if (!capabilities.has(name)) return { allowed: false, reason: 'CAPABILITY_NOT_DECLARED' };

  const tier = classifyDeviceAction(name);
  if (tier === 'DENY') return { allowed: false, reason: 'ACTION_DENIED', tier };
  if (tier === 'CONFIRM' && ownerApproved !== true) {
    return { allowed: false, reason: 'OWNER_CONFIRMATION_REQUIRED', tier };
  }
  return { allowed: true, reason: 'AUTHORIZED', tier };
}

export function boundedDeviceAudit({ deviceId, action, decision, adapter } = {}) {
  return {
    kind: 'DEVICE_ACTION_AUDIT',
    device_id: String(deviceId || '').slice(0, 128),
    action: String(action || '').slice(0, 128),
    allowed: decision?.allowed === true,
    reason: String(decision?.reason || 'UNKNOWN').slice(0, 128),
    tier: String(decision?.tier || '').slice(0, 64),
    adapter: String(adapter || '').slice(0, 128),
  };
}
