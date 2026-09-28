export const SOVEREIGNTY_LAYERS = Object.freeze([
  'ai',
  'runtime',
  'storage',
  'database',
  'source_control',
  'ci_cd',
  'secrets_identity',
  'scheduler',
  'observability',
  'backup_restore',
]);

function clean(value,max=200){return String(value||'').trim().slice(0,max);}

function normalizeLayer(id,spec={}){
  const current=clean(spec.current_adapter);
  const alternatives=Array.isArray(spec.alternative_adapters)
    ? [...new Set(spec.alternative_adapters.map(v=>clean(v)).filter(Boolean).filter(v=>v!==current))]
    : [];
  const capabilities={
    export:spec.export===true,
    import:spec.import===true,
    isolated_test:spec.isolated_test===true,
    activate:spec.activate===true,
    smoke:spec.smoke===true,
    rollback:spec.rollback===true,
  };
  const blockers=[];
  if(!current) blockers.push('CURRENT_ADAPTER_MISSING');
  if(!alternatives.length) blockers.push('ALTERNATIVE_ADAPTER_MISSING');
  for(const [name,ok] of Object.entries(capabilities)){
    if(!ok) blockers.push(`CAPABILITY_${name.toUpperCase()}_MISSING`);
  }
  return {
    id,
    current_adapter:current||null,
    alternative_adapters:alternatives,
    capabilities,
    ready:blockers.length===0,
    blockers,
  };
}

export function evaluateTechnicalSovereignty({layers={},maxAutonomy=false}={}){
  const normalized={};
  for(const id of SOVEREIGNTY_LAYERS) normalized[id]=normalizeLayer(id,layers[id]||{});
  const readyLayers=Object.values(normalized).filter(x=>x.ready).map(x=>x.id);
  const blockedLayers=Object.values(normalized).filter(x=>!x.ready).map(x=>({id:x.id,blockers:x.blockers}));
  return {
    schema:'mel.technical-sovereignty/v1',
    max_autonomy_enabled:maxAutonomy===true,
    fully_sovereign:blockedLayers.length===0,
    layer_count:SOVEREIGNTY_LAYERS.length,
    ready_layer_count:readyLayers.length,
    ready_layers:readyLayers,
    blocked_layers:blockedLayers,
    layers:normalized,
    policy:{
      provider_lock_forbidden:true,
      provider_specific_core_state_forbidden:true,
      portable_export_required:true,
      alternate_restore_required:true,
      switch_requires_isolated_test:true,
      post_switch_smoke_required:true,
      rollback_required:true,
      autonomous_switch_allowed_only_in_max:true,
      owner_halt_always_wins:true,
    },
  };
}

export function assertTechnicalSovereigntyReady(input={}){
  const report=evaluateTechnicalSovereignty(input);
  if(!report.fully_sovereign){
    const error=new Error('TECHNICAL_SOVEREIGNTY_INCOMPLETE');
    error.code='TECHNICAL_SOVEREIGNTY_INCOMPLETE';
    error.report=report;
    throw error;
  }
  return report;
}
