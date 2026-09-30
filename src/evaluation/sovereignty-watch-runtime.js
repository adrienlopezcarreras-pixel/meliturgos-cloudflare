import { migrate } from '../persistence/migrations.js';
import { createGen2Runtime } from '../core/orchestrator/gen2-runtime.js';
import { getSovereigntyWatchCatalog, SOVEREIGNTY_WATCH_INTERVAL_MS } from './sovereignty-watch-catalog.js';
import { SovereigntyCandidateStore } from '../portability/sovereignty-candidate-store.js';

const STATE_ID='sovereignty-replacement-watch';
const CURRENT_PROVIDER_DOMAINS=Object.freeze({
  ai:['cloudflare.com'],
  runtime:['cloudflare.com'],
  storage:['cloudflare.com'],
  database:['cloudflare.com'],
  source_control:['github.com'],
  ci_cd:['github.com'],
  secrets_identity:['cloudflare.com'],
  scheduler:['cloudflare.com'],
  observability:['cloudflare.com'],
  backup_restore:['cloudflare.com','google.com'],
});

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
  const currentDomains=new Set(CURRENT_PROVIDER_DOMAINS[target.layer]||[]);
  const candidateHints=[];
  const seen=new Set();
  for(const source of sources){
    let hostname='';
    try{hostname=new URL(source.url).hostname.toLowerCase().replace(/^www\./,'');}catch{}
    if(!hostname||seen.has(hostname))continue;
    if([...currentDomains].some(domain=>hostname===domain||hostname.endsWith('.'+domain)))continue;
    seen.add(hostname);
    candidateHints.push({
      id:hostname,
      provider_hint:hostname.split('.').slice(-2).join('.'),
      layer:target.layer,
      source_url:source.url,
      source_title:source.title,
      status:'UNVERIFIED',
      prevalidated:false,
      activation_allowed:false,
    });
  }

  return{
    id:target.id,
    layer:target.layer,
    status:sources.length?'OBSERVED':'UNKNOWN',
    summary:clean(research?.summary,3500),
    sources,
    candidate_hints:candidateHints.slice(0,12),
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
    candidate_hint_count:results.reduce((sum,row)=>sum+(row.candidate_hints?.length||0),0),
    activation_allowed:false,
    results,
  };
  await saveState(env.DB,{last_run_at:now,report});
  const candidateStore=new SovereigntyCandidateStore(env.DB);
  const candidatePersistence=await candidateStore.upsertFromWatch(report,{now});
  return{
    ok:true,
    skipped:false,
    status:report.unknown_count===0?'WATCHED':'DEGRADED',
    report,
    candidate_persistence:candidatePersistence,
  };
}

export const SOVEREIGNTY_REPLACEMENT_WATCH_STATE_ID=STATE_ID;


export const __sovereigntyWatchTest=Object.freeze({
  normalizeResearch,
});
