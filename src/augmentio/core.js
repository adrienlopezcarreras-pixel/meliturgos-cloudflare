import { createHash } from 'node:crypto';

export class ProviderAdapter {
  constructor(spec = {}) {
    if (!spec.providerId || !spec.modelId || typeof spec.invoke !== 'function') throw new Error('INVALID_PROVIDER_ADAPTER');
    Object.assign(this, {
      capabilities: ['GENERAL'], authRequired: false, costPerCall: 0, configured: true,
      concurrency: 1, timeoutMs: 30000, healthState: 'UNKNOWN', quota: null, terms: null
    }, spec);
  }
  id() { return `${this.providerId}:${this.modelId}`; }
  async health() { return typeof this.healthFn === 'function' ? this.healthFn() : this.healthState; }
  quotaSnapshot() { return typeof this.quotaFn === 'function' ? this.quotaFn() : this.quota; }
}

export class ProviderPool {
  constructor(adapters = []) { this.adapters = new Map(); adapters.forEach(a => this.register(a)); }
  register(adapter) { const a = adapter instanceof ProviderAdapter ? adapter : new ProviderAdapter(adapter); this.adapters.set(a.id(), a); return a; }
  list(capability = null) { return [...this.adapters.values()].filter(a => a.configured && (!capability || a.capabilities.includes(capability))); }
}

export class ZeroEuroGovernor {
  constructor(maxCost = 0) { this.maxCost = maxCost; }
  allows(adapter) { return Number(adapter.costPerCall || 0) <= this.maxCost; }
  filter(adapters) { return adapters.filter(a => this.allows(a)); }
}

export class QuotaArbitrator {
  constructor({cooldownMs = 60000, now = () => Date.now()} = {}) { this.cooldownMs = cooldownMs; this.now = now; this.cooldowns = new Map(); this.stats = new Map(); }
  available(adapter) { return (this.cooldowns.get(adapter.id()) || 0) <= this.now(); }
  record(adapter, result) { const s = this.stats.get(adapter.id()) || {calls:0, failures:0, rateLimits:0}; s.calls++; if (!result.ok) s.failures++; if (result.rateLimited) { s.rateLimits++; this.cooldowns.set(adapter.id(), this.now() + this.cooldownMs); } this.stats.set(adapter.id(), s); }
}

export class ComputeCache {
  constructor({ttlMs = 300000, now = () => Date.now()} = {}) { this.ttlMs = ttlMs; this.now = now; this.map = new Map(); }
  key(input) { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
  get(input) { const k = this.key(input), hit = this.map.get(k); if (!hit || hit.expires <= this.now()) { this.map.delete(k); return null; } return structuredClone(hit.value); }
  set(input, value) { this.map.set(this.key(input), {expires:this.now()+this.ttlMs, value:structuredClone(value)}); return value; }
}

export class ResultTournament {
  static normalize(candidate) { return String(candidate.text || candidate.response || '').trim().replace(/\s+/g, ' '); }
  select(candidates, scorer = c => (c.evidence ? 2 : 0) + Math.min(1, ResultTournament.normalize(c).length / 500)) {
    const seen = new Set(); const unique = [];
    for (const c of candidates) { const normalized = ResultTournament.normalize(c).toLowerCase(); if (!normalized || seen.has(normalized)) continue; seen.add(normalized); unique.push({...c, normalized}); }
    const scored = unique.map(c => ({...c, score:Number(scorer(c)) || 0})).sort((a,b)=>b.score-a.score);
    return {winner:scored[0] || null, candidates:scored, duplicateCount:candidates.length-unique.length};
  }
}

export class StrategyLearner {
  constructor() { this.stats = new Map(); }
  record(taskType, candidate) { const key=`${taskType}:${candidate.providerId}:${candidate.modelId}`; const s=this.stats.get(key)||{calls:0,ok:0,totalLatency:0}; s.calls++; if(candidate.ok)s.ok++; s.totalLatency+=candidate.latencyMs||0; this.stats.set(key,s); }
  score(taskType, adapter) { const s=this.stats.get(`${taskType}:${adapter.providerId}:${adapter.modelId}`); return s ? (s.ok/s.calls)*1000 - (s.totalLatency/s.calls) : 0; }
}

export class ParallelScheduler {
  constructor({pool, governor = new ZeroEuroGovernor(), quota = new QuotaArbitrator(), cache = new ComputeCache(), learner = new StrategyLearner(), globalConcurrency = 4, timeoutMs = 30000} = {}) {
    this.pool=pool; this.governor=governor; this.quota=quota; this.cache=cache; this.learner=learner; this.globalConcurrency=Math.max(1,globalConcurrency); this.timeoutMs=timeoutMs;
  }
  async run({taskType='GENERAL', input, fanout=4, scorer}={}) {
    const cacheKey={taskType,input}; const cached=this.cache.get(cacheKey); if(cached) return {...cached, cacheHit:true};
    let adapters=this.governor.filter(this.pool.list(taskType)).filter(a=>this.quota.available(a));
    adapters.sort((a,b)=>this.learner.score(taskType,b)-this.learner.score(taskType,a));
    adapters=adapters.slice(0,Math.min(fanout,this.globalConcurrency));
    if (!adapters.length) throw new Error('NO_ZERO_COST_PROVIDER_AVAILABLE');
    const started=Date.now();
    const candidates=await Promise.all(adapters.map(async adapter=>{
      const t=Date.now(); let timer;
      try {
        const value=await Promise.race([adapter.invoke(input),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('TIMEOUT'),{code:'TIMEOUT'})),Math.min(adapter.timeoutMs||this.timeoutMs,this.timeoutMs));})]);
        const candidate={ok:true,text:typeof value==='string'?value:value?.text||value?.response||'',providerId:adapter.providerId,modelId:adapter.modelId,latencyMs:Date.now()-t,provenance:{provider:adapter.providerId,model:adapter.modelId}};
        this.quota.record(adapter,{ok:true}); this.learner.record(taskType,candidate); return candidate;
      } catch(error) {
        const rateLimited=error?.status===429 || error?.code==='RATE_LIMIT'; const candidate={ok:false,error:error?.code||error?.message||'ERROR',providerId:adapter.providerId,modelId:adapter.modelId,latencyMs:Date.now()-t,rateLimited};
        this.quota.record(adapter,{ok:false,rateLimited}); this.learner.record(taskType,candidate); return candidate;
      } finally { clearTimeout(timer); }
    }));
    const successful=candidates.filter(c=>c.ok && c.text); const tournament=new ResultTournament().select(successful,scorer);
    if (!tournament.winner) throw Object.assign(new Error('ALL_PROVIDERS_FAILED'),{candidates});
    const result={text:tournament.winner.text,winner:tournament.winner,candidates,tournament,elapsedMs:Date.now()-started,cacheHit:false};
    this.cache.set(cacheKey,result); return result;
  }
}

export function buildTeacherEscalation({goal, melAnswer, result}) {
  return {type:'MEL_REQUEST',area:'augmentio',priority:'medium',goal,current_state:melAnswer,evidence:JSON.stringify({winner:result?.winner, candidates:result?.candidates?.map(c=>({providerId:c.providerId,modelId:c.modelId,ok:c.ok,latencyMs:c.latencyMs,text:c.text}))}),blocker_or_question:'Critique the orchestration result, disagreements, evidence quality and routing strategy.',proposed_next_step:'Encode any validated improvement in LEARNING_LEDGER and retest on a novel variant.'};
}
