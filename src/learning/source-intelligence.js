// MEL source intelligence — popularity, authority and benchmark signals are discovery aids, not truth.
export const SOURCE_INTELLIGENCE_SCHEMA='mel.source-intelligence/v1';

export const SOURCE_SIGNAL_FEEDS=Object.freeze({
  websites:Object.freeze([
    {id:'similarweb-top-websites',kind:'traffic',url:'https://www.similarweb.com/top-websites/',cadence:'monthly',role:'DISCOVERY_SIGNAL'},
    {id:'tranco-top-sites',kind:'consensus-popularity',url:'https://tranco-list.eu/',cadence:'daily',role:'DISCOVERY_SIGNAL'},
    {id:'majestic-million',kind:'link-authority',url:'https://majestic.com/reports/majestic-million',cadence:'daily',role:'DISCOVERY_SIGNAL'},
  ]),
  ai:Object.freeze([
    {id:'lmarena-text',kind:'human-preference',url:'https://lmarena.ai/leaderboard/text',cadence:'frequent',role:'MODEL_DISCOVERY_SIGNAL'},
    {id:'artificial-analysis',kind:'multi-benchmark',url:'https://artificialanalysis.ai/leaderboards/models',cadence:'frequent',role:'MODEL_DISCOVERY_SIGNAL'},
    {id:'swe-bench-verified',kind:'coding-benchmark',url:'https://www.swebench.com/',cadence:'frequent',role:'MODEL_DISCOVERY_SIGNAL'},
    {id:'huggingface-open-llm',kind:'open-model-benchmark',url:'https://huggingface.co/open-llm-leaderboard',cadence:'frequent',role:'MODEL_DISCOVERY_SIGNAL'},
  ]),
});

const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
function rankSignal(rank,cap=1000000){
  const n=Number(rank); if(!Number.isFinite(n)||n<=0)return null;
  return clamp(1-Math.log10(Math.min(n,cap))/Math.log10(cap));
}
function freshness(days){
  const n=Number(days); if(!Number.isFinite(n)||n<0)return null;
  if(n<=1)return 1;if(n<=7)return .95;if(n<=30)return .85;if(n<=90)return .7;if(n<=365)return .5;return .25;
}
function ratingSignal(rating,count){
  const r=Number(rating),c=Number(count);
  if(!Number.isFinite(r)||!Number.isFinite(c)||c<=0)return null;
  const normalized=r>5?clamp(r/100):clamp(r/5);
  return normalized*clamp(Math.log10(c+1)/4);
}
function authority(kind){
  const k=String(kind||'').toUpperCase();
  if(['OFFICIAL_SEED','PRIMARY_SOURCE'].includes(k))return 1;
  if(['ACADEMIC_SOURCE','STANDARD_SOURCE'].includes(k))return .92;
  if(k==='DIRECT_SOURCE')return .72;
  if(k==='REPUTABLE_SECONDARY')return .66;
  if(k==='COMMUNITY_SOURCE')return .36;
  if(k==='SEARCH_INDEX')return .12;
  return .45;
}
function weighted(rows){
  let sum=0,w=0;
  for(const row of rows){if(row.value===null||row.value===undefined)continue;sum+=clamp(row.value)*row.weight;w+=row.weight;}
  return w?sum/w:0;
}
export function scoreSourceCandidate(source={}){
  const s=source.quality_signals&&typeof source.quality_signals==='object'?source.quality_signals:{};
  const signals={
    authority:authority(source.source_kind),
    topical:s.topical_relevance===undefined?null:clamp(s.topical_relevance),
    corroboration:s.independent_corroboration===undefined?null:clamp(s.independent_corroboration),
    freshness:freshness(s.freshness_days),
    tranco:rankSignal(s.tranco_rank),
    traffic:rankSignal(s.similarweb_rank??s.traffic_rank),
    backlinks:rankSignal(s.majestic_rank??s.link_rank),
    rating:ratingSignal(s.rating,s.rating_count),
  };
  const score=weighted([
    {value:signals.authority,weight:.34},{value:signals.topical,weight:.16},
    {value:signals.corroboration,weight:.16},{value:signals.freshness,weight:.10},
    {value:signals.tranco,weight:.07},{value:signals.traffic,weight:.05},
    {value:signals.backlinks,weight:.08},{value:signals.rating,weight:.04},
  ]);
  const kind=String(source.source_kind||'').toUpperCase();
  const primary=['OFFICIAL_SEED','PRIMARY_SOURCE','ACADEMIC_SOURCE','STANDARD_SOURCE'].includes(kind);
  const direct=kind==='DIRECT_SOURCE';
  return {...source,source_quality:{
    schema:SOURCE_INTELLIGENCE_SCHEMA,
    score:Number(score.toFixed(4)),
    role:primary?'PRIMARY_AUTHORITY':direct?'SECONDARY_EVIDENCE':kind==='COMMUNITY_SOURCE'?'COMMUNITY_SIGNAL':'DISCOVERY_SIGNAL',
    fact_eligible:primary||(direct&&Number(s.independent_corroboration||0)>=.5),
    signals,
    rule:'POPULARITY_IS_NOT_TRUTH',
  }};
}
export function rankSourceCandidates(sources=[]){
  return (Array.isArray(sources)?sources:[])
    .map(scoreSourceCandidate)
    .sort((a,b)=>Number(b.source_quality?.score||0)-Number(a.source_quality?.score||0));
}

function modelMetric(value,scale=100){
  const n=Number(value);return Number.isFinite(n)?clamp(n/scale):null;
}
export function scoreAiCandidate(model={}){
  const m=model.metrics&&typeof model.metrics==='object'?model.metrics:{};
  const signals={
    arena:modelMetric(m.lmarena_score,2000),
    intelligence:modelMetric(m.artificial_analysis_score,100),
    swe:modelMetric(m.swe_bench_verified_pct,100),
    open:modelMetric(m.open_llm_score,100),
    mel:m.mel_benchmark_score===undefined?null:clamp(m.mel_benchmark_score),
    reliability:m.reliability===undefined?null:clamp(m.reliability),
    latency:m.latency_score===undefined?null:clamp(m.latency_score),
    cost:m.cost_efficiency===undefined?null:clamp(m.cost_efficiency),
  };
  const task=String(model.task||'general').toLowerCase();
  const weights=task.includes('code')
    ? {arena:.10,intelligence:.15,swe:.30,open:.05,mel:.25,reliability:.08,latency:.04,cost:.03}
    : {arena:.18,intelligence:.22,swe:.05,open:.08,mel:.25,reliability:.10,latency:.06,cost:.06};
  const score=weighted(Object.entries(weights).map(([key,weight])=>({value:signals[key],weight})));
  return {...model,model_quality:{schema:SOURCE_INTELLIGENCE_SCHEMA,score:Number(score.toFixed(4)),signals,rule:'NO_SINGLE_GLOBAL_BEST_MODEL'}};
}
export function rankAiCandidates(models=[]){
  return (Array.isArray(models)?models:[])
    .map(scoreAiCandidate)
    .sort((a,b)=>Number(b.model_quality?.score||0)-Number(a.model_quality?.score||0));
}

export function sourceIntelligenceSummary(){
  return {
    schema:SOURCE_INTELLIGENCE_SCHEMA,
    website_feeds:SOURCE_SIGNAL_FEEDS.websites.length,
    ai_feeds:SOURCE_SIGNAL_FEEDS.ai.length,
    policies:['POPULARITY_IS_NOT_TRUTH','PRIMARY_SOURCES_FOR_FACTS','MULTI_SIGNAL_DISCOVERY','TASK_SPECIFIC_MODEL_SELECTION','REPRODUCIBLE_MEL_BENCHMARK_BEFORE_PROMOTION'],
  };
}
