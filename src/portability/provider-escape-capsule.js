import {
  validateProviderNeutralManifest,
  portabilitySummary,
} from './provider-neutral-manifest.js';

export const PROVIDER_ESCAPE_SCHEMA = 'mel.provider-escape-capsule.v1';
export const PROVIDER_ESCAPE_LAYERS = Object.freeze(['ai','storage','runtime']);

const SECRET_KEY = /(api[_-]?key|token|secret|password|authorization|cookie|credential|private[_-]?key)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;

function escapeError(code) {
  return Object.assign(new Error(code), { code });
}

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 200)).filter(Boolean))];
}

function sanitize(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[REDACTED]' : value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = sanitize(item, depth + 1);
    }
    return out;
  }
  return text(value, 4000);
}

function adapterPublic(adapter) {
  return {
    id: text(adapter?.id, 200),
    contract_id: text(adapter?.contract_id, 200),
    provider: text(adapter?.provider, 200),
    optional: adapter?.optional === true,
  };
}

function layerPlan(layerId, spec, manifest) {
  const contracts = new Map((manifest.contracts || []).map(row => [text(row.id, 200), row]));
  const adapters = (manifest.adapters || []).map(adapterPublic);
  const artifacts = manifest.artifacts || [];

  const contractIds = unique(spec?.contract_ids);
  if (!contractIds.length) throw escapeError('ESCAPE_LAYER_CONTRACTS_REQUIRED');

  for (const contractId of contractIds) {
    if (!contracts.has(contractId)) throw escapeError('ESCAPE_LAYER_UNKNOWN_CONTRACT');
  }

  const currentIds = unique(spec?.current_adapter_ids);
  const current = currentIds.map(id => {
    const adapter = adapters.find(row => row.id === id);
    if (!adapter) throw escapeError('ESCAPE_LAYER_CURRENT_ADAPTER_UNKNOWN');
    if (!contractIds.includes(adapter.contract_id)) throw escapeError('ESCAPE_LAYER_CURRENT_ADAPTER_CONTRACT_MISMATCH');
    return adapter;
  });

  const currentByContract = new Map(current.map(row => [row.contract_id, row]));
  const alternatives = adapters
    .filter(row => contractIds.includes(row.contract_id))
    .filter(row => !currentIds.includes(row.id))
    .sort((a,b) => a.id.localeCompare(b.id));

  const alternativesByContract = new Map();
  for (const adapter of alternatives) {
    const rows = alternativesByContract.get(adapter.contract_id) || [];
    rows.push(adapter);
    alternativesByContract.set(adapter.contract_id, rows);
  }

  const blockers = [];
  for (const contractId of contractIds) {
    if (!currentByContract.has(contractId)) blockers.push({ code:'CURRENT_ADAPTER_REQUIRED', contract_id:contractId });
    if (!(alternativesByContract.get(contractId) || []).length) blockers.push({ code:'ALTERNATIVE_ADAPTER_REQUIRED', contract_id:contractId });
  }

  const portableArtifacts = artifacts
    .filter(row => contractIds.includes(text(row?.contract_id, 200)))
    .map(row => ({
      id: text(row.id, 200),
      contract_id: text(row.contract_id, 200),
      format: text(row.format, 100),
      ref: text(row.ref, 500),
      checksum: text(row.checksum, 200),
    }))
    .sort((a,b) => a.id.localeCompare(b.id));

  return {
    id: layerId,
    contract_ids: contractIds,
    current_adapters: current,
    alternative_adapters: alternatives,
    portable_artifacts: portableArtifacts,
    ready: blockers.length === 0,
    blockers,
    switch_scope: 'ADAPTER_BINDING_ONLY',
    migration_steps: [
      'VERIFY_SOURCE_MANIFEST',
      'VERIFY_PORTABLE_ARTIFACTS',
      'PREPARE_TARGET_ADAPTER',
      'RUN_ISOLATED_CONTRACT_TESTS',
      'REQUEST_OWNER_SWITCH_APPROVAL',
      'SWITCH_LOGICAL_BINDING',
      'RUN_POST_SWITCH_SMOKE',
      'ROLLBACK_TO_PREVIOUS_ADAPTER_ON_FAILURE',
    ],
    activation: {
      automatic: false,
      owner_approval_required: true,
      hidden_replication_forbidden: true,
    },
    rollback: {
      previous_adapter_ids: current.map(row => row.id),
      preserve_source_artifacts: true,
      automatic_provider_migration: false,
    },
  };
}

export function createProviderEscapeCapsule({
  manifest,
  layers = {},
  generated_at = new Date().toISOString(),
  source = {},
} = {}) {
  const manifestValidation = validateProviderNeutralManifest(manifest);
  if (!manifestValidation.ok) {
    const error = escapeError('ESCAPE_SOURCE_MANIFEST_INVALID');
    error.issues = manifestValidation.issues;
    throw error;
  }

  const normalizedLayers = {};
  for (const layerId of PROVIDER_ESCAPE_LAYERS) {
    const spec = layers?.[layerId];
    if (!spec) throw escapeError('ESCAPE_REQUIRED_LAYER_MISSING');
    normalizedLayers[layerId] = layerPlan(layerId, spec, manifest);
  }

  const ready = PROVIDER_ESCAPE_LAYERS.every(id => normalizedLayers[id].ready);
  return sanitize({
    schema: PROVIDER_ESCAPE_SCHEMA,
    generated_at: text(generated_at, 80),
    source: {
      branch: text(source.branch || manifest?.source?.branch, 200),
      commit: text(source.commit || manifest?.source?.commit, 120),
      portability_schema: manifest.schema,
    },
    portability: portabilitySummary(manifest),
    layers: normalizedLayers,
    ready_to_escape: ready,
    policy: {
      replace_by_contract_not_vendor: true,
      architecture_redeploy_required: false,
      automatic_activation: false,
      owner_approval_required: true,
      owner_halt_always_wins: true,
      plaintext_secrets_forbidden: true,
      rollback_required: true,
    },
  });
}

export function validateProviderEscapeCapsule(capsule) {
  const issues = [];
  if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule)) {
    return { ok:false, issues:[{type:'CAPSULE_NOT_OBJECT'}] };
  }
  if (capsule.schema !== PROVIDER_ESCAPE_SCHEMA) issues.push({type:'INVALID_SCHEMA'});
  if (!Number.isFinite(Date.parse(text(capsule.generated_at, 80)))) issues.push({type:'INVALID_GENERATED_AT'});
  if (!capsule.policy || capsule.policy.automatic_activation !== false) issues.push({type:'AUTOMATIC_ACTIVATION_FORBIDDEN'});
  if (capsule.policy?.owner_approval_required !== true) issues.push({type:'OWNER_APPROVAL_REQUIRED'});
  if (capsule.policy?.rollback_required !== true) issues.push({type:'ROLLBACK_REQUIRED'});

  for (const layerId of PROVIDER_ESCAPE_LAYERS) {
    const layer = capsule.layers?.[layerId];
    if (!layer) {
      issues.push({type:'MISSING_LAYER',layer:layerId});
      continue;
    }
    if (!Array.isArray(layer.contract_ids) || !layer.contract_ids.length) issues.push({type:'LAYER_CONTRACTS_REQUIRED',layer:layerId});
    if (layer.activation?.automatic !== false) issues.push({type:'LAYER_AUTOMATIC_ACTIVATION_FORBIDDEN',layer:layerId});
    if (layer.activation?.owner_approval_required !== true) issues.push({type:'LAYER_OWNER_APPROVAL_REQUIRED',layer:layerId});
    if (!Array.isArray(layer.migration_steps) || !layer.migration_steps.includes('ROLLBACK_TO_PREVIOUS_ADAPTER_ON_FAILURE')) {
      issues.push({type:'LAYER_ROLLBACK_STEP_REQUIRED',layer:layerId});
    }
  }

  const serialized = JSON.stringify(capsule);
  if (SECRET_VALUE.test(serialized)) issues.push({type:'SECRET_VALUE_FORBIDDEN'});
  return { ok:issues.length===0, issues };
}

export function providerEscapeSummary(capsule) {
  const validation = validateProviderEscapeCapsule(capsule);
  const layers = PROVIDER_ESCAPE_LAYERS.map(id => capsule?.layers?.[id]).filter(Boolean);
  return {
    ok: validation.ok,
    schema: capsule?.schema || null,
    ready_to_escape: capsule?.ready_to_escape === true,
    layer_count: layers.length,
    ready_layers: layers.filter(layer => layer.ready === true).map(layer => layer.id),
    blocked_layers: layers.filter(layer => layer.ready !== true).map(layer => ({
      id: layer.id,
      blockers: layer.blockers || [],
    })),
    alternative_adapter_count: layers.reduce((sum, layer) => sum + (layer.alternative_adapters?.length || 0), 0),
    issues: validation.issues,
  };
}
