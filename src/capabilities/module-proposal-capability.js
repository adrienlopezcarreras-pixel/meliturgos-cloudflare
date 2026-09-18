import { detectCapabilityGap } from '../evolution/capability-gap-detector.js';
import { validateManifest } from '../plugins/validator.js';
import { authorizeModuleDevelopment } from '../modules/module-lab.js';

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

function proposeExtensionDraft({ goal, capabilities = [], threshold = 2, kind = 'module' } = {}) {
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

  const extensionKind = kind === 'plugin' ? 'plugin' : 'module';
  const slug = slugify(goal);
  const capabilityId = `mel.${slug}`.slice(0, 100);
  const manifestInput = {
    id: `mel-${slug}`.slice(0, 100),
    name: capabilityName(goal),
    version: '0.1.0',
    description: String(goal || '').trim().slice(0, 1000),
    author: 'MEL',
    capabilities: [capabilityId],
    permissions: [],
    secrets_required: [],
    dependencies: [],
    entrypoint: `src/${extensionKind === 'plugin' ? 'plugins' : 'modules'}/generated/${slug}.js`,
    risk: riskForGoal(goal),
  };
  if (extensionKind === 'plugin') manifestInput.healthcheck = 'generated-provider-health';
  const manifest = validateManifest(manifestInput, extensionKind);

  return {
    ok: true,
    proposal_only: true,
    decision: extensionKind === 'plugin' ? 'PROPOSE_PLUGIN' : 'PROPOSE_MODULE',
    extension_kind: extensionKind,
    gap,
    manifest,
    acceptance_tests: [
      `manifest validates as ${extensionKind} ${manifest.id}`,
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

export function proposeModuleDraft(options = {}) {
  return proposeExtensionDraft({ ...options, kind: 'module' });
}

export function proposePluginDraft(options = {}) {
  return proposeExtensionDraft({ ...options, kind: 'plugin' });
}

/**
 * MEL-EVOL-02 bridge: only a genuine detected gap may enter the existing
 * Module Lab. The Council gate is reused rather than duplicated, and this
 * bridge stops at the non-mutating `need` stage: it never generates code,
 * registers a capability or activates a module.
 */
export async function enterModuleLabForGap({
  goal,
  capabilities = [],
  threshold = 2,
  councilReport,
  moduleLab,
  context = {},
} = {}) {
  const proposal = proposeModuleDraft({ goal, capabilities, threshold });

  if (proposal.decision !== 'PROPOSE_MODULE') {
    return {
      ...proposal,
      module_lab_entered: false,
      module_lab_stage: null,
      code_generation_allowed: false,
      teacher_required: false,
    };
  }

  const councilGate = authorizeModuleDevelopment(councilReport);
  if (!moduleLab || typeof moduleLab.need !== 'function') {
    throw Object.assign(new Error('MODULE_LAB_NEED_ADAPTER_REQUIRED'), {
      code: 'MODULE_LAB_NEED_ADAPTER_REQUIRED',
      status: 503,
    });
  }

  const needInput = {
    goal: String(goal || '').trim(),
    gap: {
      classification: proposal.gap.classification,
      confidence: proposal.gap.confidence,
      best_match: proposal.gap.best_match,
    },
    manifest: proposal.manifest,
    acceptance_tests: proposal.acceptance_tests,
    proposal_only: true,
    activation_allowed: false,
  };
  const need = await moduleLab.need(needInput, context);

  return {
    ...proposal,
    decision: 'MODULE_LAB_NEED',
    module_lab_entered: true,
    module_lab_stage: 'need',
    module_lab_need: need,
    council_gate: {
      authorized: councilGate.authorized === true,
      next: councilGate.next,
      phase: councilReport?.phase || null,
      responses: Array.isArray(councilReport?.responses) ? councilReport.responses.length : 0,
    },
    code_generation_allowed: false,
    activation_allowed: false,
    teacher_required: true,
    next_action: 'Complete MEL synthesis and exact-SHA Teacher review before any spec/code generation. Keep production activation human-approved.',
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

  bus.discover({
    id: 'evolution.plugin.propose',
    name: 'Proposition de plugin MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Turns a verified tooling/connector capability gap into a bounded plugin manifest draft without writing or activating code.',
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
  }, input => proposePluginDraft({ goal: input.goal, threshold: input.threshold, capabilities: bus.list() }));
  return bus;
}
