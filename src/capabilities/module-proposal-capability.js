import { detectCapabilityGap } from '../evolution/capability-gap-detector.js';
import { validateManifest } from '../plugins/validator.js';

function slugify(value) {
  const slug = String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'new-capability';
}

function riskForGoal(goal) {
  const text = String(goal || '').toLowerCase();
  if (/\b(delete|supprime|paiement|payment|achat|purchase|deploy|production|secret|token|password|mail\s+send|envoie\s+.*mail|shutdown|power)\b/i.test(text)) return 'HIGH';
  if (/\b(write|modifier|modifie|create|cr[ée]e|update|device|appareil|fichier|file|gmail|calendar|agenda)\b/i.test(text)) return 'MEDIUM';
  return 'LOW';
}

function capabilityName(goal) {
  const words = String(goal || '').trim().split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
  return words || 'Nouvelle capacité MEL';
}

export function proposeModuleDraft({ goal, capabilities = [], threshold = 2 } = {}) {
  const gap = detectCapabilityGap({ goal, capabilities, threshold });
  const shouldDraft = gap.classification === 'POSSIBLE_GAP';
  if (!shouldDraft) {
    return {
      ok: true,
      proposal_only: true,
      decision: gap.classification === 'MATCHED_AVAILABLE' ? 'REUSE_EXISTING' : 'REVIEW_EXISTING',
      gap,
      manifest: null,
      activation_allowed: false,
      next_action: gap.next_action,
    };
  }

  const slug = slugify(goal);
  const capabilityId = `mel.${slug}`.slice(0, 100);
  const manifest = validateManifest({
    id: `mel-${slug}`.slice(0, 100),
    name: capabilityName(goal),
    version: '0.1.0',
    description: String(goal || '').trim().slice(0, 1000),
    author: 'MEL',
    capabilities: [capabilityId],
    permissions: [],
    secrets_required: [],
    dependencies: [],
    entrypoint: `src/modules/generated/${slug}.js`,
    risk: riskForGoal(goal),
  }, 'module');

  return {
    ok: true,
    proposal_only: true,
    decision: 'PROPOSE_MODULE',
    gap,
    manifest,
    acceptance_tests: [
      `manifest validates as module ${manifest.id}`,
      `capability ${capabilityId} is discoverable only after candidate registration`,
      'handler rejects invalid input and secrets by default',
      'candidate tests pass before activation',
      'production activation remains human-approved',
    ],
    activation_allowed: false,
    activation_requirements: ['AI_COUNCIL_BEFORE_CODE', 'SANDBOX_TESTS', 'SECURITY_REVIEW', 'HUMAN_PRODUCTION_APPROVAL'],
    next_action: 'Run evolution.preflight, then Mentor proposal and candidate tests. Do not activate directly from this draft.',
  };
}

export function registerModuleProposalCapability(bus) {
  bus.discover({
    id: 'evolution.module.propose',
    name: 'Proposition de module MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Turns a verified capability gap into a bounded valid module manifest draft without writing or activating code.',
    input_schema: {
      type: 'object',
      properties: {
        goal: { type: 'string', minLength: 1, maxLength: 4000 },
        threshold: { type: 'integer', minimum: 1, maximum: 6 },
      },
      required: ['goal'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, input => proposeModuleDraft({ goal: input.goal, threshold: input.threshold, capabilities: bus.list() }));
  return bus;
}
