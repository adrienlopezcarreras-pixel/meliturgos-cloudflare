import {
  createAlternativeRegistry,
  PREVALIDATED_ALTERNATIVE_LAYERS,
} from './prevalidated-alternative-registry.js';

function clean(v,max=300){return String(v||'').trim().slice(0,max);}
function toMs(v){const n=Date.parse(String(v||''));return Number.isFinite(n)?n:null;}

export function dueAlternatives(registry,{now=Date.now(),refreshBeforeMs=7*24*60*60*1000}={}){
  const out=[];
  for(const layer of PREVALIDATED_ALTERNATIVE_LAYERS){
    for(const row of registry?.layers?.[layer]||[]){
      const expires=toMs(row?.proof?.expires_at);
      const verified=toMs(row?.proof?.verified_at);
      const due = !row?.prevalidated
        || expires==null
        || expires-now<=refreshBeforeMs
        || verified==null;
      if(due) out.push(row);
    }
  }
  return out;
}

export async function revalidateAlternativeRegistry({
  registry,
  verify,
  now=Date.now(),
  ttlMs=30*24*60*60*1000,
  refreshBeforeMs=7*24*60*60*1000,
}={}){
  if(typeof verify!=='function') throw Object.assign(new TypeError('ALTERNATIVE_REVALIDATOR_REQUIRED'),{code:'ALTERNATIVE_REVALIDATOR_REQUIRED'});
  const due=dueAlternatives(registry,{now,refreshBeforeMs});
  const byId=new Map((registry?.all||[]).map(row=>[row.id,row]));
  const results=[];

  for(const row of due){
    let evidence;
    try{
      evidence=await verify(row);
    }catch(error){
      evidence={ok:false,code:clean(error?.code||error?.message||'REVALIDATION_FAILED',180)};
    }

    const previous=byId.get(row.id)||row;
    if(evidence?.ok===true){
      byId.set(row.id,{
        ...previous,
        proof:{
          isolated_test:evidence.isolated_test!==false,
          smoke:evidence.smoke!==false,
          rollback:evidence.rollback!==false,
          export:evidence.export!==false,
          import:evidence.import!==false,
          activate:evidence.activate!==false,
          verified_at:new Date(now).toISOString(),
          expires_at:new Date(now+ttlMs).toISOString(),
          evidence_ref:clean(evidence.evidence_ref,500)||previous?.proof?.evidence_ref||null,
          source_sha:clean(evidence.source_sha,80)||previous?.proof?.source_sha||null,
        },
      });
      results.push({id:row.id,layer:row.layer,status:'REVALIDATED'});
    }else{
      byId.set(row.id,{
        ...previous,
        proof:{
          ...(previous.proof||{}),
          isolated_test:false,
          smoke:false,
          activate:false,
          verified_at:new Date(now).toISOString(),
          expires_at:new Date(now).toISOString(),
          evidence_ref:clean(evidence?.evidence_ref,500)||previous?.proof?.evidence_ref||null,
        },
      });
      results.push({id:row.id,layer:row.layer,status:'INVALIDATED',code:clean(evidence?.code||'REVALIDATION_FAILED',180)});
    }
  }

  const next=createAlternativeRegistry([...byId.values()]);
  return {
    ok:true,
    checked_at:new Date(now).toISOString(),
    due_count:due.length,
    revalidated_count:results.filter(r=>r.status==='REVALIDATED').length,
    invalidated_count:results.filter(r=>r.status==='INVALIDATED').length,
    results,
    registry:next,
  };
}
