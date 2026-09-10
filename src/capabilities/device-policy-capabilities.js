import { authorizeDeviceAction, boundedDeviceAudit, classifyDeviceAction } from '../devices/device-control-policy.js';

export function registerDevicePolicyCapabilities(bus) {
  bus.discover({
    id: 'device.policy.preview',
    name: 'Prévisualiser une action appareil',
    category: 'device',
    version: '1.0.0',
    provider: 'core',
    description: 'Classifies and authorizes a proposed device action without sending any command to a real device.',
    input_schema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', minLength: 1, maxLength: 128 },
        capabilities: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 128 } },
        action: { type: 'string', minLength: 1, maxLength: 128 },
        ownerApproved: { type: 'boolean' },
        ownerShutdown: { type: 'boolean' },
        adapter: { type: 'string', minLength: 0, maxLength: 128 },
      },
      required: ['deviceId', 'capabilities', 'action'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async (input) => {
    const device = { id: input.deviceId, capabilities: input.capabilities };
    const decision = authorizeDeviceAction({
      device,
      action: input.action,
      ownerApproved: input.ownerApproved === true,
      ownerShutdown: input.ownerShutdown === true,
    });
    return {
      ok: true,
      action: input.action,
      classification: classifyDeviceAction(input.action),
      decision,
      audit: boundedDeviceAudit({
        deviceId: input.deviceId,
        action: input.action,
        decision,
        adapter: input.adapter || 'preview-only',
      }),
      executed: false,
    };
  });
}
