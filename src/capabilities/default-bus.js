import { CapabilityBus } from './capability-bus.js';
/** Safe deterministic capability proving chat→bus→tool context wiring. */
export function createDefaultCapabilityBus({ audit } = {}) {
  const bus = new CapabilityBus({ audit });
  bus.discover({
    id: 'echo', name: 'Echo', category: 'utility', version: '1.0.0', provider: 'core',
    description: 'Returns a bounded value for integration tests',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async input => ({ value: input.value }));
  return bus;
}
