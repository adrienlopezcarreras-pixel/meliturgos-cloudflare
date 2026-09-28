const LAYERS = Object.freeze([
  'ai','runtime','storage','database','source_control','ci_cd',
  'secrets_identity','scheduler','observability','backup_restore',
]);

function clean(v,max=300){return String(v||'').trim().slice(0,max);}
function err(code,status=400){const e=new Error(code);e.code=code;e.status=status;return e;}

function normalizeProof(proof={}){
  return {
    isolated_test:proof.isolated_test===true,
    smoke:proof.smoke===true,
    rollback:proof.rollback===true,
    export:proof.export===true,
    import:proof.import===true,
    activate:proof.activate===true,
    verified_at:clean(proof.verified_at,100)||null,
    expires_at:clean(proof.expires_at,100)||null,
    evidence_ref:clean(proof.evidence_ref,500)||null,
    source_sha:clean(proof.source_sha,80)||null,
  };
}

function proofComplete(proof){
  return proof.isolated_test===true
    && proof.smoke===true
    && proof.rollback===true
    && proof.export===true
    && proof.import===true
    && proof.activate===true;
}

function fresh(proof,now=Date.now()){
  if(!proof.verified_at) return false;
  const verified=Date.parse(proof.verified_at);
  if(!Number.isFinite(verified)) return false;
  if(proof.expires_at){
    const expires=Date.parse(proof.expires_at);
    if(!Number.isFinite(expires) || expires<=now) return false;
  }
  return verified<=now;
}

export function normalizeAlternative(record={}){
  const layer=clean(record.layer,80);
  if(!LAYERS.includes(layer)) throw err('ALTERNATIVE_LAYER_INVALID');
  const id=clean(record.id,200);
  const provider=clean(record.provider,200);
  if(!id||!provider) throw err('ALTERNATIVE_IDENTITY_REQUIRED');

  const proof=normalizeProof(record.proof);
  return Object.freeze({
    id,
    layer,
    provider,
    adapter_id:clean(record.adapter_id,200)||null,
    endpoint_class:clean(record.endpoint_class,120)||null,
    cost_mode:clean(record.cost_mode,80)||'UNKNOWN',
    added_cost_eur:Number.isFinite(Number(record.added_cost_eur))?Number(record.added_cost_eur):null,
    credential_ref:clean(record.credential_ref,160)||null,
    proof:Object.freeze(proof),
    prevalidated:proofComplete(proof)&&fresh(proof),
    notes:clean(record.notes,1000)||null,
  });
}

export function createAlternativeRegistry(records=[]){
  const normalized=(Array.isArray(records)?records:[]).map(normalizeAlternative);
  const byLayer=Object.fromEntries(LAYERS.map(layer=>[layer,[]]));
  for(const row of normalized) byLayer[row.layer].push(row);
  for(const layer of LAYERS){
    byLayer[layer].sort((a,b)=>{
      if(a.prevalidated!==b.prevalidated) return a.prevalidated?-1:1;
      const ac=a.added_cost_eur==null?Infinity:a.added_cost_eur;
      const bc=b.added_cost_eur==null?Infinity:b.added_cost_eur;
      return ac-bc || a.id.localeCompare(b.id);
    });
  }
  return Object.freeze({
    schema:'mel.prevalidated-alternatives/v1',
    layers:Object.freeze(byLayer),
    all:Object.freeze(normalized),
  });
}

export function eligibleAlternatives(registry,layer,{maxAddedCostEur=0,now=Date.now()}={}){
  const rows=registry?.layers?.[layer]||[];
  return rows.filter(row=>{
    if(!row.prevalidated) return false;
    if(!fresh(row.proof,now)) return false;
    if(row.added_cost_eur==null) return maxAddedCostEur===Infinity;
    return row.added_cost_eur<=maxAddedCostEur;
  });
}

export function sovereigntyCoverageFromRegistry(registry){
  const coverage={};
  for(const layer of LAYERS){
    const rows=registry?.layers?.[layer]||[];
    const ready=rows.filter(row=>row.prevalidated);
    coverage[layer]={
      ready:ready.length>0,
      prevalidated_count:ready.length,
      alternatives:ready.map(row=>row.id),
      providers:[...new Set(ready.map(row=>row.provider))],
    };
  }
  return Object.freeze({
    schema:'mel.prevalidated-alternatives-coverage/v1',
    fully_covered:LAYERS.every(layer=>coverage[layer].ready),
    covered_layers:LAYERS.filter(layer=>coverage[layer].ready),
    uncovered_layers:LAYERS.filter(layer=>!coverage[layer].ready),
    coverage:Object.freeze(coverage),
  });
}

export const PREVALIDATED_ALTERNATIVE_LAYERS=LAYERS;
