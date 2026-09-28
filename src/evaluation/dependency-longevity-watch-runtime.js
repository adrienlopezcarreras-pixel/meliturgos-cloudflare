import { migrate } from '../persistence/migrations.js';
import { createGen2Runtime } from '../core/orchestrator/gen2-runtime.js';
import {
  CRITICAL_DEPENDENCIES,
  runDependencyLongevityWatch,
} from './dependency-longevity-watch.js';

const STATE_ID='dependency-longevity-canonical';
const DEFAULT_INTERVAL_MS=6*60*60*1000;

function corpus(research={}){
  return [
    research?.summary||'',
    ...(Array.isArray(research?.sources)?research.sources.map(row=>[
      row?.title||'',row?.snippet||'',row?.content||''
    ].join(' ')):[]),
  ].join(' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,160000);
}

function firstDate(text,patterns=[]){
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(!match) continue;
    const parsed=Date.parse(match[1]);
    if(Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function evidenceFromResearch(dep,research={}){
  const text=corpus(research);
  const lower=text.toLowerCase();
  const sources=(Array.isArray(research?.sources)?research.sources:[])
    .slice(0,8).map(row=>({title:String(row?.title||'').slice(0,240),url:String(row?.url||'').slice(0,500)}))
    .filter(row=>/^https:\/\//.test(row.url));

  const deprecated=/\b(deprecat(?:ed|ion)|legacy|sunset)\b/i.test(text);
  const shutdown=/\b(end of life|end-of-life|eol|shut(?:ting)? down|service closure|discontinued|retired)\b/i.test(text);
  const breaking=/\b(breaking change|incompatible api|api version.*removed|migration required)\b/i.test(text);
  const freeLost=/\b(free tier.*(?:end|removed|discontinued)|no longer free|pricing change)\b/i.test(text);
  const forcedExit=/\b(terms.*(?:prohibit|forbid)|service unavailable in your region|account migration mandatory)\b/i.test(text);

  const eolAt=firstDate(text,[
    /(?:end of life|end-of-life|eol|shut(?:ting)? down|discontinued|retired)[^\n.]{0,120}?(\d{4}-\d{2}-\d{2})/i,
    /(?:end of life|end-of-life|eol|shut(?:ting)? down|discontinued|retired)[^\n.]{0,120}?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i,
  ]);

  return {
    reachable:sources.length>0,
    deprecated,
    deprecation_at:deprecated?firstDate(text,[
      /deprecat(?:ed|ion)[^\n.]{0,120}?(\d{4}-\d{2}-\d{2})/i,
      /deprecat(?:ed|ion)[^\n.]{0,120}?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i,
    ]):null,
    eol_at:shutdown?eolAt:null,
    api_breaking_change:breaking,
    free_tier_lost:freeLost,
    cost_increase:/\b(price increase|pricing increase|higher price|cost increase)\b/i.test(text),
    terms_force_exit:forcedExit,
    replacement_candidates:[],
    sources,
    checked_at:new Date().toISOString(),
    research_summary:String(research?.summary||'').slice(0,4000),
    signal_count:[deprecated,shutdown,breaking,freeLost,forcedExit].filter(Boolean).length,
    provider:dep.provider,
  };
}

async function ensureState(env){
  if(!env?.DB) throw Object.assign(new Error('LONGEVITY_WATCH_DB_REQUIRED'),{code:'LONGEVITY_WATCH_DB_REQUIRED'});
  await migrate(env.DB);
  return {
    async load(){
      const row=await env.DB.prepare('SELECT state_json,updated_at FROM capability_watch_state WHERE id=?')
        .bind(STATE_ID).first();
      if(!row?.state_json) return {last_run_at:0,report:null};
      try{return JSON.parse(row.state_json);}catch{return {last_run_at:0,report:null};}
    },
    async save(state){
      await env.DB.prepare(`INSERT INTO capability_watch_state(id,state_json,updated_at)
        VALUES(?,?,?)
        ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
        .bind(STATE_ID,JSON.stringify(state),Date.now()).run();
    },
  };
}

function queryFor(dep){
  return [
    dep.provider,
    'official documentation status deprecation end of life sunset pricing free tier breaking API migration',
  ].join(' ');
}

export async function runDependencyLongevityWatchRuntime(env,{
  now=Date.now(),
  force=false,
  intervalMs=Number(env?.MEL_LONGEVITY_WATCH_INTERVAL_MS)||DEFAULT_INTERVAL_MS,
}={}){
  const state=await ensureState(env);
  const prior=await state.load();
  const last=Number(prior?.last_run_at||0);
  if(!force && last>0 && now-last<intervalMs){
    return {
      ok:true,
      skipped:true,
      reason:'INTERVAL_NOT_DUE',
      next_due_at:last+intervalMs,
      report:prior?.report||null,
    };
  }

  const runtime=createGen2Runtime({env});
  const report=await runDependencyLongevityWatch({
    dependencies:CRITICAL_DEPENDENCIES,
    now,
    inspect:async dep=>{
      const research=await runtime.bus.execute('web.research',{
        query:queryFor(dep),
        depth:2,
        seed_urls:[],
      },{
        owner:env.MELITURGOS_USER||'owner',
        permissions:env.CAPABILITY_PERMISSIONS||[],
        requestId:crypto.randomUUID(),
      });
      return evidenceFromResearch(dep,research);
    },
  });

  const persisted={
    last_run_at:now,
    report,
    emergency_layers:report.results.filter(row=>row.severity==='EMERGENCY').map(row=>row.dependency.layer),
    migration_layers:report.results.filter(row=>row.severity==='MIGRATION_REQUIRED').map(row=>row.dependency.layer),
  };
  await state.save(persisted);

  return {
    ok:true,
    skipped:false,
    status:report.emergency_count>0?'EMERGENCY':report.migration_required_count>0?'MIGRATION_REQUIRED':'WATCHED',
    report,
  };
}

export const DEPENDENCY_LONGEVITY_STATE_ID=STATE_ID;
