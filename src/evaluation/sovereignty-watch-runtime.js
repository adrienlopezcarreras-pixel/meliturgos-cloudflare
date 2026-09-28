import { migrate } from '../persistence/migrations.js';
import { createGen2Runtime } from '../core/orchestrator/gen2-runtime.js';
import { getSovereigntyWatchCatalog, SOVEREIGNTY_WATCH_INTERVAL_MS } from './sovereignty-watch-catalog.js';

const STATE_ID='sovereignty-replacement-watch';

function clean(v,max=4000){return String(v||'').replace(/\s+/g,' ').trim().slice(0,max);}

async function loadState(db){
  await migrate(db);
  const row=await db.prepare('SELECT state_json FROM capability_watch_state WHERE id=?').bind(STATE_ID).first();
  if(!row?.state_json)return{last_run_at:0,report:null};
  try{return JSON.parse(row.state_json);}catch{return{last_run_at:0,report:null};}
}

async function saveState(db,state){
  await db.prepare(`INSERT INTO capability_watch_state(id,state_json,updated_at)
    VALUES(?,?,?)
    ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
    .bind(STATE_ID,JSON.stringify(state),Date.now()).run();
}

function normalizeResearch(target,research={}){
  const sources=(Array.isArray(research?.sources)?research.sources:[])
    .slice(0,12)
    .map(row=>({
      title:clean(row?.title,240),
      url:clean(row?.url,500),
      snippet:clean(row?.snippet||row?.content,1200),
    }))
    .filter(row=>/^https:\/\//i.test(row.url));
  return{
    id:target.id,
    layer:target.layer,
    status:sources.length?'OBSERVED':'UNKNOWN',
    summary:clean(research?.summary,3500),
    sources,
    candidate_status:'DISCOVERY_ONLY',
    activation_allowed:false,
    prevalidated:false,
    verification_policy:target.metadata.verification_policy,
  };
}

export async function runSovereigntyReplacementWatchRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_SOVEREIGNTY_WATCH_INTERVAL_MS)||SOVEREIGNTY_WATCH_INTERVAL_MS,
}={}){
  if(!env?.DB)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};
  const prior=await loadState(env.DB);
  const last=Number(prior?.last_run_at||0);
  if(!force&&last>0&&now-last<intervalMs){
    return{ok:true,skipped:true,reason:'INTERVAL_NOT_DUE',next_due_at:last+intervalMs,report:prior?.report||null};
  }

  const runtime=createGen2Runtime({env});
  const catalog=getSovereigntyWatchCatalog();
  const results=[];
  for(const target of catalog.targets){
    try{
      const research=await runtime.bus.execute('web.research',{
        query:target.metadata.query,
        depth:2,
        seed_urls:[],
      },{
        owner:env.MELITURGOS_USER||'owner',
        permissions:env.CAPABILITY_PERMISSIONS||[],
        requestId:crypto.randomUUID(),
      });
      results.push(normalizeResearch(target,research));
    }catch(error){
      results.push({
        id:target.id,
        layer:target.layer,
        status:'UNKNOWN',
        summary:'',
        sources:[],
        candidate_status:'DISCOVERY_FAILED',
        activation_allowed:false,
        prevalidated:false,
        verification_policy:target.metadata.verification_policy,
        error:clean(error?.code||error?.message||error,300),
      });
    }
  }

  const report={
    schema:'mel.sovereignty-replacement-watch/v1',
    generated_at:new Date(now).toISOString(),
    target_count:results.length,
    observed_count:results.filter(row=>row.status==='OBSERVED').length,
    unknown_count:results.filter(row=>row.status==='UNKNOWN').length,
    activation_allowed:false,
    results,
  };
  await saveState(env.DB,{last_run_at:now,report});
  return{
    ok:true,
    skipped:false,
    status:report.unknown_count===0?'WATCHED':'DEGRADED',
    report,
  };
}

export const SOVEREIGNTY_REPLACEMENT_WATCH_STATE_ID=STATE_ID;
