import { standardRegistry } from './ModelRegistry.js';
import { categorize, retryable } from './fallback.js';
import { DomainError } from '../core/contracts.js';
export const TASK_TYPES = Object.freeze(['GENERAL','FAST','REASONING','CODE','VISION','AUDIO','STEERABLE','FALLBACK']);
export function classifyTask(text) { return /function |class |code|\.js\b|python/i.test(text) ? 'CODE' : /raisonne|reason|démontr/i.test(text) ? 'REASONING' : 'GENERAL'; }
export class ModelRouter {
  constructor({registry=standardRegistry, invoke, timeoutMs=30000, maxCalls=2}={}) { this.registry=registry; this.invoke=invoke; this.timeoutMs=timeoutMs; this.maxCalls=Math.min(2,Math.max(1,maxCalls)); this.stats={calls:0,failures:0}; }
  classifyTask(text) { return classifyTask(text); }
  selectModel(task, {model}={}) { const candidates=this.registry.modelsByCapability(task); const selected=model ? candidates.find(m=>m.id===model) : candidates[0]; if (!selected) throw new DomainError('capability_missing',422); return selected; }
  fallback(task, excluded=[]) { return this.registry.modelsByCapability(task).filter(m=>!excluded.includes(m.id)); }
  async execute({task='GENERAL',messages,model},context={}) {
    if (!this.invoke) throw new DomainError('MODEL_PROVIDER_UNCONFIGURED',503);
    const primary=this.selectModel(task,{model});
    const candidates=[primary,...this.fallback(task,[primary.id])].slice(0,this.maxCalls);
    let failure;
    for (let i=0;i<candidates.length;i++) {
      let timer; const selected=candidates[i]; this.stats.calls++;
      try {
        const result=await Promise.race([this.invoke(selected,messages,context),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new DomainError('timeout',504)),this.timeoutMs);})]);
        const text=typeof result==='string'?result:result?.response || result?.text || result?.message?.content;
        if (typeof text!=='string' || !text.trim()) throw new DomainError('EMPTY_MODEL_RESPONSE',502);
        return {text:text.trim(),model:selected.id,task,attempts:i+1,fallback_used:i>0,tool_succeeded:true};
      } catch(error) { this.stats.failures++; failure=error; if (!retryable(categorize(error))) throw error; }
      finally {clearTimeout(timer);}
    }
    throw failure;
  }
  getStats() { return {...this.stats,totalModels:this.registry.size()}; }
}
