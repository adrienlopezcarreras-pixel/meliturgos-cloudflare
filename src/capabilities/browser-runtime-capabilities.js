import { createBrowserController } from '../devices/browser-capability.js';
import { createBrowserCompanionAdapter, isBrowserCompanionBinding } from '../devices/browser-companion-adapter.js';

const browserInputSchema = { type: 'object', additionalProperties: true };
const browserOutputSchema = { type: 'object', additionalProperties: true };

/** Registers the single runtime entry point for real browser execution. */
export function registerBrowserRuntimeCapabilities(bus, { binding } = {}) {
  const available = isBrowserCompanionBinding(binding);
  const adapter = available ? createBrowserCompanionAdapter({ binding }) : null;
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
    version: '1.0.0',
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
