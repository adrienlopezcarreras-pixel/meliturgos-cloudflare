import { PREVALIDATED_ALTERNATIVE_LAYERS } from './prevalidated-alternative-registry.js';

function clean(v,max=300){return String(v||'').trim().slice(0,max);}

function layerCandidates(watchReport,layer){
  const rows=(watchReport?.results||[]).filter(row=>row?.layer===layer);
  return rows.flatMap(row=>Array.isArray(row?.candidate_hints)?row.candidate_hints:[])
    .filter(row=>row?.id)
    .map(row=>({
      id:clean(row.id,200),
      provider_hint:clean(row.provider_hint,200)||null,
      source_url:clean(row.source_url,500)||null,
      status:clean(row.status,80)||'UNVERIFIED',
    }));
}

function classifyLayer({layer,registry,watchReport,now=Date.now()}){
  const alternatives=registry?.layers?.[layer]||[];
  const fresh=alternatives.filter(row=>{
    if(row?.prevalidated!==true)return false;
    const expires=Date.parse(String(row?.proof?.expires_at||''));
    return Number.isFinite(expires)&&expires>now;
  });
  if(fresh.length){
    return {
      layer,
      status:'COVERED',
      blocking_reason:null,
      live_alternatives:fresh.map(row=>row.id),
      candidate_hints:[],
      next_action:'MAINTAIN_REVALIDATION',
    };
  }

  const configured=alternatives.filter(row=>row?.id);
  if(configured.length){
    const hasExpired=configured.some(row=>{
      const expires=Date.parse(String(row?.proof?.expires_at||''));
      return Number.isFinite(expires)&&expires<=now;
    });
    const costBlocked=configured.some(row=>row?.added_cost_eur==null||Number(row.added_cost_eur)>0);
    return {
      layer,
      status:'BLOCKED',
      blocking_reason:hasExpired?'PROOF_EXPIRED':costBlocked?'COST_NOT_ZERO_VERIFIED':'LIVE_PROOF_MISSING',
      live_alternatives:[],
      configured_alternatives:configured.map(row=>row.id),
      candidate_hints:layerCandidates(watchReport,layer),
      next_action:hasExpired?'REVALIDATE_PROVIDER':costBlocked?'FIND_OR_AUTHORIZE_ZERO_COST_PROVIDER':'RUN_LIVE_PREVALIDATION',
    };
  }

  const candidates=layerCandidates(watchReport,layer);
  return {
    layer,
    status:'BLOCKED',
    blocking_reason:candidates.length?'PROVIDER_NOT_CONFIGURED':'NO_CANDIDATE_DISCOVERED',
    live_alternatives:[],
    configured_alternatives:[],
    candidate_hints:candidates,
    next_action:candidates.length?'CONFIGURE_AND_PREVALIDATE_CANDIDATE':'CONTINUE_SOVEREIGNTY_WATCH',
  };
}

export function planSovereigntyGapClosure({
  registry,
  watchReport=null,
  now=Date.now(),
}={}){
  const layers=PREVALIDATED_ALTERNATIVE_LAYERS.map(layer=>classifyLayer({layer,registry,watchReport,now}));
  const covered=layers.filter(row=>row.status==='COVERED');
  const blocked=layers.filter(row=>row.status!=='COVERED');

  const priorityOrder=['ai','runtime','source_control','database','storage','ci_cd','secrets_identity','scheduler','observability','backup_restore'];
  blocked.sort((a,b)=>priorityOrder.indexOf(a.layer)-priorityOrder.indexOf(b.layer));

  return Object.freeze({
    schema:'mel.sovereignty-gap-plan/v1',
    generated_at:new Date(now).toISOString(),
    fully_covered:blocked.length===0,
    covered_count:covered.length,
    blocked_count:blocked.length,
    covered_layers:Object.freeze(covered.map(row=>row.layer)),
    blocked_layers:Object.freeze(blocked),
    next_layer:blocked[0]?.layer||null,
    next_action:blocked[0]?.next_action||'MAINTAIN_REVALIDATION',
  });
}
