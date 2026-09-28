const LAYERS = new Set(['ai','storage','runtime','source_control']);

function error(code, status = 409) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

function text(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

export async function executeProviderSwitch({
  maxAutonomy = false,
  layer,
  currentAdapter,
  candidateAdapter,
  runIsolatedContractTests,
  activateAdapter,
  runPostSwitchSmoke,
  rollbackAdapter,
} = {}) {
  if (maxAutonomy !== true) throw error('PROVIDER_SWITCH_MAX_AUTONOMY_REQUIRED', 403);
  const normalizedLayer = text(layer, 80);
  if (!LAYERS.has(normalizedLayer)) throw error('PROVIDER_SWITCH_LAYER_INVALID', 400);
  const current = text(currentAdapter, 200);
  const candidate = text(candidateAdapter, 200);
  if (!current || !candidate || current === candidate) throw error('PROVIDER_SWITCH_ADAPTER_INVALID', 400);
  if (typeof runIsolatedContractTests !== 'function') throw error('PROVIDER_SWITCH_CONTRACT_TEST_REQUIRED', 400);
  if (typeof activateAdapter !== 'function') throw error('PROVIDER_SWITCH_ACTIVATOR_REQUIRED', 400);
  if (typeof runPostSwitchSmoke !== 'function') throw error('PROVIDER_SWITCH_SMOKE_REQUIRED', 400);
  if (typeof rollbackAdapter !== 'function') throw error('PROVIDER_SWITCH_ROLLBACK_REQUIRED', 400);

  const tested = await runIsolatedContractTests({ layer: normalizedLayer, currentAdapter: current, candidateAdapter: candidate });
  if (tested?.ok !== true) {
    return {
      ok: false,
      status: 'CANDIDATE_PROVIDER_REJECTED',
      layer: normalizedLayer,
      current_adapter: current,
      candidate_adapter: candidate,
      activation_attempted: false,
      rollback_attempted: false,
      test_evidence: tested || null,
    };
  }

  const activation = await activateAdapter({ layer: normalizedLayer, from: current, to: candidate });
  if (activation?.ok !== true) {
    return {
      ok: false,
      status: 'PROVIDER_ACTIVATION_FAILED',
      layer: normalizedLayer,
      current_adapter: current,
      candidate_adapter: candidate,
      activation_attempted: true,
      rollback_attempted: false,
    };
  }

  let smoke;
  try {
    smoke = await runPostSwitchSmoke({ layer: normalizedLayer, activeAdapter: candidate });
  } catch (e) {
    smoke = { ok: false, code: text(e?.code || e?.message || 'POST_SWITCH_SMOKE_FAILED', 180) };
  }

  if (smoke?.ok === true) {
    return {
      ok: true,
      status: 'PROVIDER_SWITCH_VERIFIED',
      layer: normalizedLayer,
      previous_adapter: current,
      active_adapter: candidate,
      activation_attempted: true,
      rollback_attempted: false,
      test_evidence: tested,
      smoke_evidence: smoke,
    };
  }

  const rollback = await rollbackAdapter({ layer: normalizedLayer, from: candidate, to: current });
  if (rollback?.ok !== true) throw error('PROVIDER_SWITCH_ROLLBACK_FAILED', 500);

  return {
    ok: false,
    status: 'PROVIDER_SWITCH_ROLLED_BACK',
    layer: normalizedLayer,
    previous_adapter: current,
    failed_adapter: candidate,
    active_adapter: current,
    activation_attempted: true,
    rollback_attempted: true,
    rollback_ok: true,
    test_evidence: tested,
    smoke_evidence: smoke,
  };
}

export const PROVIDER_SWITCH_LAYERS = Object.freeze([...LAYERS]);
