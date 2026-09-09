import { standardRegistry } from './ModelRegistry.js';
import { categorize, retryable } from './fallback.js';
import { DomainError } from '../core/contracts.js';
import { analyzeRefusal } from './refusal-analyzer.js';
export const TASK_TYPES = Object.freeze(['GENERAL','FAST','REASONING','CODE','VISION','AUDIO','STEERABLE','FALLBACK']);
export function classifyTask(text) { return /function |class |code|\.js\b|python/i.test(text) ? 'coding' : /raisonne|reason|démontr|explain|why|how/i.test(text) ? 'reasoning' : 'conversation'; }
export class ModelRouter {
  constructor({registry=standardRegistry, invoke, finalFallback, timeoutMs=30000, maxCalls=2}={}) { this.registry=registry; this.invoke=invoke; this.finalFallback=finalFallback; this.timeoutMs=timeoutMs; this.maxCalls=Math.min(2,Math.max(1,maxCalls)); this.stats={calls:0,failures:0}; }
  classifyTask(text) { return classifyTask(text); }
  normalizeTask(task) { return ({chat:'GENERAL',general:'GENERAL',conversation:'GENERAL',coding:'CODE',code:'CODE',reasoning:'REASONING',vision:'VISION',audio:'AUDIO',fast:'FAST',steerable:'STEERABLE',fallback:'FALLBACK'})[String(task).toLowerCase()] || String(task).toUpperCase(); }
  selectModel(task, {model}={}) { const capability=this.normalizeTask(task); let candidates=this.registry.modelsByCapability(capability); if (!candidates.length && capability==='GENERAL') candidates=this.registry.modelsByCapability('FALLBACK'); const selected=model ? candidates.find(m=>m.id===model) : candidates[0]; if (!selected) throw new DomainError('capability_missing',422); return selected; }
  fallback(task, excluded=[]) { const capability=this.normalizeTask(task); return this.registry.modelsByCapability(capability).filter(m=>!excluded.includes(m.id)); }
  async execute({task='GENERAL',messages,model},context={}) {
    if (!this.invoke) throw new DomainError('MODEL_PROVIDER_UNCONFIGURED',503);
    const primary=this.selectModel(task,{model});
    const candidates=[primary,...this.fallback(task,[primary.id])].slice(0,this.maxCalls);
    let failure; const reasons=[];
    for (let i=0;i<candidates.length;i++) {
      let timer; const selected=candidates[i]; this.stats.calls++;
      try {
        const result=await Promise.race([this.invoke(selected,messages,context),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new DomainError('timeout',504)),this.timeoutMs);})]);
        const text=typeof result==='string'?result:result?.response || result?.text || result?.message?.content;
        if (typeof text!=='string' || !text.trim()) throw new DomainError('EMPTY_MODEL_RESPONSE',502);
        return {text:text.trim(),model:selected.id,provider:selected.provider,task,attempts:i+1,fallback_used:i>0,tool_succeeded:true};
      } catch(error) { this.stats.failures++; failure=error; reasons.push(error.reason||error.code||error.message||'unknown'); if (!retryable(categorize(error))) break; }
      finally {clearTimeout(timer);}
    }
    const refusal=analyzeRefusal(failure);
    if (this.finalFallback && refusal.useFinalFallback) {
      try { const result=await this.finalFallback({messages,task,reason:refusal.reason,previousModels:candidates.map(c=>c.id),previousFailureReasons:reasons,context}); const text=typeof result==='string'?result:result?.text||result?.response; if(!text) throw new DomainError('provider_unavailable',502); return {text:String(text).trim(),model:result.model||'ninjachat-default',provider:'ninjachat',task,attempts:candidates.length+1,fallback_used:true,ninjachat_used:true,ninjachat_reason:refusal.reason,previous_models:candidates.map(c=>c.id),previous_failure_reasons:reasons,tool_succeeded:true}; } catch(error) { failure=error; }
    }
    throw failure;
  }
  listModels(task) { return this.registry.modelsByCapability(this.normalizeTask(task)); }
  estimateCost(task) { return this.selectModel(task).cost || 0; }
  callModel(task, request, options={}) { return this.execute({task,messages:request.messages || request,model:options.model}); }
  getStats() { return {...this.stats,totalModels:this.registry.size(),capabilities:this.registry.list().flatMap(m=>m.capabilities)}; }
}
