import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { createControlledSelfHealingCoordinator } from '../resilience/self-healing-coordinator.js';
import { createSelfHealingPlan } from '../resilience/self-healing-policy.js';

function configured(env = {}) {
  const adapters = env.MEL_SELF_HEALING_ADAPTERS;
  const repository = env.MEL_SELF_HEALING_REPOSITORY
    || (env.DB && typeof env.DB.prepare === 'function' ? new D1DevJobRepository(env.DB) : null);

  if (!repository || !adapters || typeof adapters !== 'object') {
    return { repository, adapters: null, coordinator: null };
  }
  if (typeof adapters.detect !== 'function' || typeof adapters.diagnose !== 'function') {
    return { repository, adapters, coordinator: null };
  }

  return {
    repository,
    adapters,
    coordinator: createControlledSelfHealingCoordinator({
      repository,
      detect: adapters.detect,
      diagnose: adapters.diagnose,
      buildCandidate: adapters.buildCandidate,
      testCandidate: adapters.testCandidate,
      applyRepair: adapters.applyRepair,
      rollback: adapters.rollback,
    }),
  };
}

function objectSchema(properties = {}, required = []) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const approvalSchema = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    action: { type: 'string', maxLength: 40 },
    incident_id: { type: 'string', maxLength: 120 },
    repair_id: { type: 'string', maxLength: 120 },
  },
  additionalProperties: false,
};

const incidentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 120 },
    detected: { type: 'boolean' },
    severity: { type: 'string', maxLength: 40 },
    evidence: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 500 } },
  },
  additionalProperties: true,
};

export function registerSelfHealingCapabilities(bus, env = {}) {
  const runtime = configured(env);
  const inspectAvailable = Boolean(runtime.coordinator);
  const prepareAvailable = Boolean(
    runtime.coordinator
      && typeof runtime.adapters?.buildCandidate === 'function'
      && typeof runtime.adapters?.testCandidate === 'function',
  );
  const applyAvailable = Boolean(prepareAvailable && typeof runtime.adapters?.applyRepair === 'function');
  const rollbackAvailable = Boolean(runtime.coordinator && typeof runtime.adapters?.rollback === 'function');

  bus.discover({
    id: 'self-healing.policy.preview',
    name: 'Prévisualiser la politique Self Healing',
    category: 'resilience',
    version: '1.0.0',
    provider: 'core',
    description: 'Évalue les règles GEN2-18 sans exécuter de diagnostic, réparation ou rollback.',
    input_schema: {
      type: 'object',
      properties: {
        owner_halt: { type: 'boolean' },
        incident: incidentSchema,
        repair: { type: 'object', additionalProperties: true },
        rollback: { type: 'object', additionalProperties: true },
        approval: approvalSchema,
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async input => ({
    ok: true,
    executed: false,
    plan: createSelfHealingPlan(input),
  }));

  bus.discover({
    id: 'self-healing.inspect',
    name: 'Inspecter un incident MEL',
    category: 'resilience',
    version: '1.0.0',
    provider: 'core',
    description: 'Détecte et diagnostique un incident via les adapters serveur configurés, sans mutation de réparation.',
    input_schema: objectSchema({
      incident_id: { type: 'string', minLength: 1, maxLength: 120 },
      signal: { type: 'object', additionalProperties: true },
      owner_halt: { type: 'boolean' },
    }, ['incident_id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: inspectAvailable ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context) => runtime.coordinator.inspect(input, context));

  bus.discover({
    id: 'self-healing.prepare',
    name: 'Préparer une réparation MEL',
    category: 'resilience',
    version: '1.0.0',
    provider: 'core',
    description: 'Construit une candidate réversible et exécute les tests configurés; n’applique pas encore la réparation.',
    input_schema: objectSchema({
      incident_id: { type: 'string', minLength: 1, maxLength: 120 },
      repair_id: { type: 'string', minLength: 1, maxLength: 120 },
      target: { type: 'string', enum: ['candidate', 'production'] },
      rollback_ref: { type: 'string', minLength: 1, maxLength: 240 },
      owner_halt: { type: 'boolean' },
      approval: approvalSchema,
    }, ['incident_id', 'repair_id', 'rollback_ref']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [],
    approval: {
      required: true,
      scope: 'self-healing.prepare',
      reason: 'Candidate construction can mutate a development workspace.',
    },
    health: prepareAvailable ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context) => runtime.coordinator.prepareRepair(input, context));

  bus.discover({
    id: 'self-healing.apply',
    name: 'Appliquer une réparation MEL',
    category: 'resilience',
    version: '1.0.0',
    provider: 'core',
    description: 'Applique uniquement une réparation préparée, testée et autorisée par GEN2-18.',
    input_schema: objectSchema({
      incident_id: { type: 'string', minLength: 1, maxLength: 120 },
      owner_halt: { type: 'boolean' },
      approval: approvalSchema,
    }, ['incident_id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [],
    approval: {
      required: true,
      scope: 'self-healing.apply',
      reason: 'Repair application is a mutating operation.',
    },
    health: applyAvailable ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context) => runtime.coordinator.applyPreparedRepair(input, context));

  bus.discover({
    id: 'self-healing.rollback',
    name: 'Rollback Self Healing MEL',
    category: 'resilience',
    version: '1.0.0',
    provider: 'core',
    description: 'Exécute un rollback seulement avec double validation: approval gate du bus et approbation incident-scoped GEN2-18.',
    input_schema: objectSchema({
      incident_id: { type: 'string', minLength: 1, maxLength: 120 },
      restore_ref: { type: 'string', minLength: 1, maxLength: 240 },
      owner_halt: { type: 'boolean' },
      approval: approvalSchema,
    }, ['incident_id', 'restore_ref', 'approval']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [],
    approval: {
      required: true,
      scope: 'self-healing.rollback',
      reason: 'Rollback changes runtime/deployment state.',
    },
    health: rollbackAvailable ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async (input, context) => runtime.coordinator.rollback(input, context));
}
