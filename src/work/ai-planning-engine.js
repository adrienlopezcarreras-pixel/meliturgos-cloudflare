import { createWorkPlan } from './planning-engine.js';
import { validate } from '../security/validation.js';

function planningError(code) {
  return Object.assign(new Error(code), { code });
}

function descriptorEligible(record) {
  const id = String(record?.id || '');
  return Boolean(id)
    && record?.enabled === true
    && String(record?.health || '') !== 'UNAVAILABLE'
    && !id.startsWith('work.');
}

function compactDescriptor(record) {
  return {
    id: String(record.id),
    name: String(record.name || '').slice(0, 100),
    description: String(record.description || '').slice(0, 220),
    risk: String(record.risk || 'MEDIUM'),
    enabled: record.enabled === true,
    health: String(record.health || 'UNKNOWN'),
    approval_required: record.approval?.required === true,
    input_schema: record.input_schema,
  };
}

export function buildPlanningCatalog(capabilities = [], { maxChars = 7000, maxEntries = 64 } = {}) {
  const eligible = (Array.isArray(capabilities) ? capabilities : [])
    .filter(descriptorEligible)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const selected = [];
  let used = 2;
  for (const record of eligible) {
    if (selected.length >= Math.max(1, Number(maxEntries) || 64)) break;
    const compact = compactDescriptor(record);
    const size = JSON.stringify(compact).length + 1;
    if (used + size > Math.max(1000, Number(maxChars) || 7000)) continue;
    selected.push(compact);
    used += size;
  }
  return selected;
}

export function buildWorkPlanningPrompt({ goal, constraints = [], catalog = [] } = {}) {
  const normalizedGoal = String(goal || '').trim().slice(0, 4000);
  if (!normalizedGoal) throw planningError('WORK_PLAN_GOAL_REQUIRED');
  if (!Array.isArray(catalog) || !catalog.length) throw planningError('WORK_PLAN_CAPABILITY_CATALOG_EMPTY');

  return [
    'Tu es le planificateur de MEL. Transforme l’objectif en un plan exécutable, minimal et borné.',
    'Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni commentaire.',
    'FORMAT EXACT:',
    '{"steps":[{"id":"step-1","title":"...","capability":"capability.id","input":{},"dependsOn":[],"idempotent":false}],"constraints":[]}',
    'RÈGLES:',
    '- utilise uniquement un capability.id présent dans AVAILABLE_CAPABILITIES;',
    '- chaque input doit respecter exactement le input_schema de la capability choisie;',
    '- n’utilise jamais une capability work.*;',
    '- 1 à 32 étapes maximum;',
    '- les dépendances doivent viser des ids du même plan et rester acycliques;',
    '- idempotent=true seulement pour une opération réellement répétable sans effet supplémentaire;',
    '- une capability avec approval_required=true peut être planifiée mais son exécution restera soumise au gate propriétaire;',
    '- n’invente ni résultat, ni secret, ni capacité manquante;',
    'OBJECTIF:',
    normalizedGoal,
    'CONTRAINTES:',
    JSON.stringify((Array.isArray(constraints) ? constraints : []).slice(0, 32)),
    'AVAILABLE_CAPABILITIES:',
    JSON.stringify(catalog),
  ].join('\n').slice(0, 12000);
}

function extractJsonObject(text) {
  const source = String(text || '').trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/i, '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw planningError('WORK_PLAN_MODEL_JSON_REQUIRED');
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    throw planningError('WORK_PLAN_MODEL_JSON_INVALID');
  }
}

export function parseCapabilityAwareWorkPlan({
  text,
  id,
  goal,
  constraints = [],
  catalog = [],
  source = 'ai:work.plan.generate',
} = {}) {
  const payload = extractJsonObject(text);
  if (!Array.isArray(payload.steps) || payload.steps.length < 1 || payload.steps.length > 32) {
    throw planningError('WORK_PLAN_MODEL_STEPS_INVALID');
  }

  const catalogMap = new Map(catalog.map((record) => [String(record.id), record]));
  const steps = payload.steps.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw planningError('WORK_PLAN_MODEL_STEP_INVALID');
    const capability = String(raw.capability || '').trim();
    const descriptor = catalogMap.get(capability);
    if (!descriptor || !descriptorEligible(descriptor)) throw planningError('WORK_PLAN_MODEL_CAPABILITY_INVALID');
    const input = raw.input == null ? {} : raw.input;
    if (Array.isArray(input) || typeof input !== 'object') throw planningError('WORK_PLAN_MODEL_INPUT_INVALID');

    try {
      validate(input, descriptor.input_schema);
    } catch (error) {
      throw Object.assign(new Error('WORK_PLAN_MODEL_INPUT_SCHEMA_INVALID'), {
        code: 'WORK_PLAN_MODEL_INPUT_SCHEMA_INVALID',
        cause_code: error?.code || error?.message || null,
        capability,
      });
    }

    const safeIdempotent = raw.idempotent === true
      && String(descriptor.risk || '').toUpperCase() === 'LOW'
      && descriptor.approval_required !== true;

    return {
      id: String(raw.id || `step-${index + 1}`).slice(0, 200),
      title: String(raw.title || descriptor.name || capability).slice(0, 300),
      capability,
      input,
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
      idempotent: safeIdempotent,
    };
  });

  const generatedConstraints = Array.isArray(payload.constraints)
    ? payload.constraints.map((value) => String(value || '').slice(0, 500)).filter(Boolean)
    : [];

  const plan = createWorkPlan({
    id,
    goal,
    constraints: [...(Array.isArray(constraints) ? constraints : []), ...generatedConstraints].slice(0, 32),
    steps,
    source,
  });

  return {
    plan,
    generator: {
      proposed_step_count: payload.steps.length,
      accepted_step_count: plan.steps.length,
      capability_catalog_size: catalog.length,
    },
  };
}
