import { eligibleAlternatives } from '../portability/prevalidated-alternative-registry.js';

export const DEPENDENCY_LONGEVITY_SCHEMA = 'mel.dependency-longevity-watch/v1';

export const CRITICAL_DEPENDENCIES = Object.freeze([
  { id:'ai.primary', layer:'ai', provider:'configured-model-provider', criticality:'CRITICAL' },
  { id:'runtime.primary', layer:'runtime', provider:'cloudflare-workers', criticality:'CRITICAL' },
  { id:'storage.primary', layer:'storage', provider:'cloudflare-r2', criticality:'CRITICAL' },
  { id:'database.primary', layer:'database', provider:'cloudflare-d1', criticality:'CRITICAL' },
  { id:'source-control.primary', layer:'source_control', provider:'github', criticality:'CRITICAL' },
  { id:'ci.primary', layer:'ci_cd', provider:'github-actions', criticality:'HIGH' },
  { id:'secrets.primary', layer:'secrets_identity', provider:'cloudflare-secrets', criticality:'CRITICAL' },
  { id:'scheduler.primary', layer:'scheduler', provider:'cloudflare-cron', criticality:'HIGH' },
  { id:'observability.primary', layer:'observability', provider:'cloudflare-observability', criticality:'HIGH' },
  { id:'backup.primary', layer:'backup_restore', provider:'shardvault+google-drive', criticality:'CRITICAL' },
]);

function clean(value,max=300){return String(value||'').trim().slice(0,max);}
function time(value){const n=Date.parse(String(value||''));return Number.isFinite(n)?n:null;}

function normalizeEvidence(raw={}){
  return {
    reachable:raw.reachable!==false,
    deprecated:raw.deprecated===true,
    deprecation_at:time(raw.deprecation_at),
    eol_at:time(raw.eol_at),
    api_breaking_change:raw.api_breaking_change===true,
    free_tier_lost:raw.free_tier_lost===true,
    cost_increase:raw.cost_increase===true,
    terms_force_exit:raw.terms_force_exit===true,
    replacement_candidates:Array.isArray(raw.replacement_candidates)
      ? raw.replacement_candidates.slice(0,10).map(row=>({
          id:clean(row?.id,200),
          prevalidated:row?.prevalidated===true,
          score:Number.isFinite(Number(row?.score))?Number(row.score):null,
        })).filter(row=>row.id)
      : [],
    sources:Array.isArray(raw.sources)
      ? raw.sources.slice(0,10).map(row=>({title:clean(row?.title,240),url:clean(row?.url,500)})).filter(row=>/^https:\/\//.test(row.url))
      : [],
    checked_at:clean(raw.checked_at,100)||null,
  };
}

export function classifyDependencyLongevity(dependency,evidence,{now=Date.now()}={}){
  const e=normalizeEvidence(evidence);
  const eolHours=e.eol_at==null?null:(e.eol_at-now)/3600000;
  const deprecationHours=e.deprecation_at==null?null:(e.deprecation_at-now)/3600000;

  let severity='HEALTHY';
  let action='KEEP';
  let trigger_code=null;

  if(e.reachable===false){
    severity='EMERGENCY';
    action='FAILOVER_NOW';
    trigger_code='SERVICE_UNREACHABLE_CRITICAL';
  }else if(e.terms_force_exit===true){
    severity='EMERGENCY';
    action='FAILOVER_NOW';
    trigger_code='PROVIDER_POLICY_FORCES_EXIT';
  }else if(eolHours!=null && eolHours<=24){
    severity='EMERGENCY';
    action='FAILOVER_NOW';
    trigger_code='SERVICE_EOL_IMMINENT';
  }else if(eolHours!=null && eolHours<=24*30){
    severity='MIGRATION_REQUIRED';
    action='PREPARE_AND_TEST_REPLACEMENT';
    trigger_code='SERVICE_SHUTDOWN_ANNOUNCED';
  }else if(e.deprecated===true || (deprecationHours!=null && deprecationHours<=24*90) || e.api_breaking_change===true){
    severity='MIGRATION_REQUIRED';
    action='PREPARE_AND_TEST_REPLACEMENT';
    trigger_code=e.api_breaking_change?'MIGRATION_DEADLINE_IMMINENT':null;
  }else if(e.free_tier_lost===true || e.cost_increase===true){
    severity='REVIEW';
    action='BENCHMARK_ALTERNATIVES';
  }else if(e.replacement_candidates.length){
    severity='REVIEW';
    action='BENCHMARK_ALTERNATIVES';
  }

  const prevalidated=e.replacement_candidates.filter(row=>row.prevalidated);
  return {
    dependency:{...dependency},
    evidence:e,
    severity,
    action,
    trigger_code,
    eol_hours:eolHours,
    deprecation_hours:deprecationHours,
    prevalidated_alternatives:prevalidated,
    unattended_emergency_possible:severity==='EMERGENCY' && prevalidated.length>0,
  };
}

export async function runDependencyLongevityWatch({
  dependencies=CRITICAL_DEPENDENCIES,
  inspect,
  now=Date.now(),
}={}){
  if(typeof inspect!=='function')throw Object.assign(new TypeError('DEPENDENCY_LONGEVITY_INSPECTOR_REQUIRED'),{code:'DEPENDENCY_LONGEVITY_INSPECTOR_REQUIRED'});
  const results=[];
  for(const dep of dependencies){
    try{
      const evidence=await inspect(dep);
      results.push(classifyDependencyLongevity(dep,evidence,{now}));
    }catch(error){
      results.push({
        dependency:{...dep},
        severity:'UNKNOWN',
        action:'RETRY_INSPECTION',
        trigger_code:null,
        inspection_error:clean(error?.code||error?.message||error,300),
        prevalidated_alternatives:[],
        unattended_emergency_possible:false,
      });
    }
  }

  const rank={EMERGENCY:0,MIGRATION_REQUIRED:1,REVIEW:2,UNKNOWN:3,HEALTHY:4};
  results.sort((a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||String(a.dependency.id).localeCompare(String(b.dependency.id)));
  return {
    schema:DEPENDENCY_LONGEVITY_SCHEMA,
    checked_at:new Date(now).toISOString(),
    dependency_count:results.length,
    emergency_count:results.filter(r=>r.severity==='EMERGENCY').length,
    migration_required_count:results.filter(r=>r.severity==='MIGRATION_REQUIRED').length,
    review_count:results.filter(r=>r.severity==='REVIEW').length,
    unknown_count:results.filter(r=>r.severity==='UNKNOWN').length,
    results,
    next_actions:results.filter(r=>r.action!=='KEEP').map(r=>({
      id:r.dependency.id,
      layer:r.dependency.layer,
      action:r.action,
      trigger_code:r.trigger_code,
      unattended_emergency_possible:r.unattended_emergency_possible,
    })),
  };
}

export function emergencyFailoverRequestFromLongevity(result,{ownerReachable=true}={}){
  if(result?.severity!=='EMERGENCY'||!result?.trigger_code)return null;
  return {
    layer:result.dependency.layer,
    trigger:{
      code:result.trigger_code,
      deadlineAt:result.evidence?.eol_at?new Date(result.evidence.eol_at).toISOString():null,
      serviceReachable:result.evidence?.reachable!==false,
      ownerReachable:ownerReachable===true,
    },
    approvedAlternatives:(result.prevalidated_alternatives||[]).map(row=>({
      id:row.id,
      prevalidated:true,
      score:row.score,
    })),
  };
}


export function emergencyFailoverRequestFromRegistry(result,{
  registry,
  ownerReachable=true,
  maxAddedCostEur=0,
  now=Date.now(),
}={}){
  if(result?.severity!=='EMERGENCY'||!result?.trigger_code)return null;
  const alternatives=eligibleAlternatives(
    registry,
    result.dependency.layer,
    {maxAddedCostEur,now},
  );
  return {
    layer:result.dependency.layer,
    trigger:{
      code:result.trigger_code,
      deadlineAt:result.evidence?.eol_at?new Date(result.evidence.eol_at).toISOString():null,
      serviceReachable:result.evidence?.reachable!==false,
      ownerReachable:ownerReachable===true,
    },
    approvedAlternatives:alternatives.map(row=>({
      id:row.id,
      provider:row.provider,
      adapter_id:row.adapter_id,
      prevalidated:true,
      score:null,
      proof_verified_at:row.proof.verified_at,
      proof_expires_at:row.proof.expires_at,
      added_cost_eur:row.added_cost_eur,
    })),
  };
}
