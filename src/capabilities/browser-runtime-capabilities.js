import {
  BROWSER_ACTIONS,
  BROWSER_CAPABILITY_SCHEMA,
  createBrowserController,
} from '../devices/browser-capability.js';
import {
  createBrowserCompanionAdapter,
  isBrowserCompanionBinding,
} from '../devices/browser-companion-adapter.js';

const browserActionValues = Object.freeze(Object.values(BROWSER_ACTIONS));

const browserStepSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 200 },
    action: { type: 'string', enum: browserActionValues },
    url: { type: 'string', minLength: 0, maxLength: 4096 },
    selector: { type: 'string', minLength: 0, maxLength: 1000 },
    text: { type: 'string', minLength: 0, maxLength: 8192 },
    delta_x: { type: 'number' },
    delta_y: { type: 'number' },
  },
  required: ['id', 'action'],
  additionalProperties: false,
};

const browserApprovalSchema = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    session_id: { type: 'string', minLength: 1, maxLength: 200 },
    step_id: { type: 'string', minLength: 1, maxLength: 200 },
    action: { type: 'string', enum: browserActionValues },
  },
  required: ['approved', 'session_id', 'step_id', 'action'],
  additionalProperties: false,
};

const browserInputSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', minLength: 1, maxLength: 200 },
    owner_halt: { type: 'boolean' },
    device: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 200 },
        capabilities: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          items: { type: 'string', minLength: 1, maxLength: 160 },
        },
      },
      required: ['id', 'capabilities'],
      additionalProperties: false,
    },
    sandbox: {
      type: 'object',
      properties: {
        allowed_origins: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: { type: 'string', minLength: 1, maxLength: 4096 },
        },
        max_steps: { type: 'integer', minimum: 1, maximum: 64 },
      },
      required: ['allowed_origins'],
      additionalProperties: false,
    },
    approvals: {
      type: 'array',
      minItems: 0,
      maxItems: 64,
      items: browserApprovalSchema,
    },
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: browserStepSchema,
    },
  },
  required: ['session_id', 'device', 'sandbox', 'steps'],
  additionalProperties: false,
};

const browserOutputSchema = {
  type: 'object',
  properties: {
    schema: { type: 'string', enum: [BROWSER_CAPABILITY_SCHEMA] },
    ok: { type: 'boolean' },
    session_id: { type: 'string', minLength: 1, maxLength: 200 },
    device_id: { type: 'string', minLength: 1, maxLength: 200 },
    steps_completed: { type: 'integer', minimum: 0, maximum: 64 },
    outputs: {
      type: 'array',
      minItems: 0,
      maxItems: 64,
      items: {
        type: 'object',
        properties: {
          step_id: { type: 'string', minLength: 1, maxLength: 200 },
          ok: { type: 'boolean' },
          output: { type: 'object', additionalProperties: true },
        },
        required: ['step_id', 'ok', 'output'],
        additionalProperties: false,
      },
    },
  },
  required: ['schema', 'ok', 'session_id', 'device_id', 'steps_completed', 'outputs'],
  additionalProperties: false,
};

/** Registers the single runtime entry point for real browser execution. */
export function registerBrowserRuntimeCapabilities(bus, {
  binding,
  endpoint,
  timeoutMs,
} = {}) {
  const available = isBrowserCompanionBinding(binding);
  const adapter = available ? createBrowserCompanionAdapter({ binding, endpoint, timeoutMs }) : null;
  const controller = adapter ? createBrowserController({
    adapter,
    authorize: async (permission, context = {}) => permission === 'browser:control'
      && Boolean(context.owner)
      && context.permissions?.includes('browser.control') === true,
    audit: async event => bus.audit({ capability: 'browser.execute', ...event }),
  }) : null;

  return bus.discover({
    id: 'browser.execute',
    name: 'Navigateur compagnon contrôlé',
    category: 'device',
    version: '1.1.0',
    provider: 'mel',
    description: 'Executes an approval-gated browser plan through the explicitly configured MEL browser companion binding.',
    input_schema: browserInputSchema,
    output_schema: browserOutputSchema,
    risk: 'HIGH',
    permissions: ['browser.control'],
    health: available ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context) => controller.execute(input, context), available ? async () => adapter.health() : null);
}
