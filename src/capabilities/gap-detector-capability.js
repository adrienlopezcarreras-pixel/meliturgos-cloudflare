import { detectCapabilityGap } from '../evolution/capability-gap-detector.js';

export function registerGapDetectorCapability(bus) {
  bus.discover({
    id: 'evolution.gap.detect',
    name: 'Détecteur de compétence manquante',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Compares a natural-language goal with the live CapabilityBus before MEL proposes duplicate capability code.',
    input_schema: {
      type: 'object',
      properties: {
        goal: { type: 'string', minLength: 1, maxLength: 4000 },
        threshold: { type: 'integer', minimum: 1, maximum: 6 }
      },
      required: ['goal'],
      additionalProperties: false
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true
  }, async input => detectCapabilityGap({ goal: input.goal, threshold: input.threshold, capabilities: bus.list() }));
}
