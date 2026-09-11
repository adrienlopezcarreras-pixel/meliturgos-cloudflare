import { standardRegistry } from './ModelRegistry.js';
import { categorize, retryable } from './fallback.js';
import { DomainError } from '../core/contracts.js';
import { analyzeRefusal } from './refusal-analyzer.js';

export const TASK_TYPES = Object.freeze(['GENERAL','FAST','REASONING','CODE','VISION','AUDIO','STEERABLE','FALLBACK']);

export function classifyTask(text) {
  return /function |class |code|\.js\b|python/i.test(text)
    ? 'coding'
    : /raisonne|reason|démontr|explain|why|how/i.test(text)
      ? 'reasoning'
      : 'conversation';
}

export function extractModelText(result) {
  if (typeof result === 'string') return result;
  return result?.response
    ?? result?.text
    ?? result?.message?.content
    ?? result?.choices?.[0]?.message?.content
    ?? result?.choices?.[0]?.text
    ?? null;
}

export function extractFinishReason(result) {
  if (!result || typeof result === 'string') return null;
  const value = result.finish_reason
    ?? result.finishReason
    ?? result.stop_reason
    ?? result.stopReason
    ?? result.message?.finish_reason
    ?? result.message?.finishReason
    ?? result.choices?.[0]?.finish_reason
    ?? result.choices?.[0]?.stop_reason
    ?? null;
  return value == null ? null : String(value).trim().toLowerCase();
}

export function isTruncationFinishReason(reason) {
  const value = String(reason || '').trim().toLowerCase();
  if (!value) return false;
  return [
    'length',
    'max_tokens',
    'max_token',
    'max_output_tokens',
    'token_limit',
    'context_length',
    'max_length',
  ].includes(value) || /(?:max|token|length).*(?:limit|length|tokens?)/i.test(value);
}

function completionMetadata(result) {
  const finishReason = extractFinishReason(result);
  return {
    finish_reason: finishReason,
    truncated: isTruncationFinishReason(finishReason),
    usage: result && typeof result === 'object' ? (result.usage || null) : null,
  };
}

export class ModelRouter {
  constructor({registry=standardRegistry, invoke, finalFallback, timeoutMs=120000, maxCalls=2, augmentio=null}={}) {
    this.registry=registry;
    this.invoke=invoke;
    this.finalFallback=finalFallback;
    this.timeoutMs=timeoutMs;
    this.maxCalls=Math.max(1,Number(maxCalls)||2);
    this.augmentio=augmentio;
    this.stats={calls:0,failures:0,augmentioCalls:0};
  }

  classifyTask(text) { return classifyTask(text); }

  normalizeTask(task) {
    return ({chat:'GENERAL',general:'GENERAL',conversation:'GENERAL',coding:'CODE',code:'CODE',reasoning:'REASONING',vision:'VISION',audio:'AUDIO',fast:'FAST',steerable:'STEERABLE',fallback:'FALLBACK'})[String(task).toLowerCase()] || String(task).toUpperCase();
  }

  selectModel(task, {model}={}) {
    const capability=this.normalizeTask(task);
    let candidates=this.registry.modelsByCapability(capability);
    if (!candidates.length && capability==='GENERAL') candidates=this.registry.modelsByCapability('FALLBACK');
    const selected=model ? candidates.find(m=>m.id===model) : candidates[0];
    if (!selected) throw new DomainError('capability_missing',422);
    return selected;
  }

  fallback(task, excluded=[]) {
    const capability=this.normalizeTask(task);
    return this.registry.modelsByCapability(capability).filter(m=>!excluded.includes(m.id));
  }

  async executeParallel({task='GENERAL',messages,maxCandidates=this.maxCalls},context={}) {
    if (!this.augmentio?.fanOut) throw new DomainError('AUGMENTIO_UNCONFIGURED',503);
    this.stats.augmentioCalls++;
    const input=Array.isArray(messages) ? messages.map(m=>({role:m.role||'user',content:String(m.content||'')})) : String(messages||'');
    const result=await this.augmentio.fanOut({capability:this.normalizeTask(task),input,context,maxCandidates});
    const best = result?.best || {};
    const finishReason = extractFinishReason(best);
    return {
      text: best.text,
      model: best.model,
      provider: best.provider,
      task,
      attempts: result.providersAttempted?.length || result.candidates?.length || 1,
      fallback_used: (result.failures||0)>0,
      augmentio_used: true,
      candidates: result.candidates,
      provenance: best.provenance,
      provider_health: result.providerHealth,
      cache_hit: result.cacheHit===true,
      tool_succeeded: true,
      finish_reason: finishReason,
      truncated: isTruncationFinishReason(finishReason),
      usage: best.usage || null,
    };
  }

  async execute({task='GENERAL',messages,model,parallel=false,maxCandidates},context={}) {
    if (parallel && this.augmentio?.fanOut) return this.executeParallel({task,messages,maxCandidates},context);
    if (!this.invoke) throw new DomainError('MODEL_PROVIDER_UNCONFIGURED',503);
    const primary=this.selectModel(task,{model});
    const candidates=[primary,...this.fallback(task,[primary.id])].slice(0,this.maxCalls);
    let failure;
    const reasons=[];
    for (let i=0;i<candidates.length;i++) {
      let timer;
      const selected=candidates[i];
      this.stats.calls++;
      try {
        const result=await Promise.race([
          this.invoke(selected,messages,context),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(new DomainError('timeout',504)),this.timeoutMs);})
        ]);
        const text=extractModelText(result);
        if (typeof text!=='string' || !text.trim()) throw new DomainError('EMPTY_MODEL_RESPONSE',502);
        return {
          text:text.trim(),
          model:selected.id,
          provider:selected.provider,
          task,
          attempts:i+1,
          fallback_used:i>0,
          tool_succeeded:true,
          ...completionMetadata(result),
        };
      } catch(error) {
        this.stats.failures++;
        failure=error;
        reasons.push(error.reason||error.code||error.message||'unknown');
        if (!retryable(categorize(error))) break;
      } finally {
        clearTimeout(timer);
      }
    }

    const refusal=analyzeRefusal(failure);
    if (this.finalFallback && refusal.useFinalFallback) {
      try {
        const result=await this.finalFallback({messages,task,reason:refusal.reason,previousModels:candidates.map(c=>c.id),previousFailureReasons:reasons,context});
        const text=extractModelText(result);
        if(!text) throw new DomainError('provider_unavailable',502);
        return {
          text:String(text).trim(),
          model:result?.model||'ninjachat-default',
          provider:'ninjachat',
          task,
          attempts:candidates.length+1,
          fallback_used:true,
          ninjachat_used:true,
          ninjachat_reason:refusal.reason,
          previous_models:candidates.map(c=>c.id),
          previous_failure_reasons:reasons,
          tool_succeeded:true,
          ...completionMetadata(result),
        };
      } catch(error) {
        failure=error;
      }
    }
    throw failure;
  }

  listModels(task) { return this.registry.modelsByCapability(this.normalizeTask(task)); }
  estimateCost(task) { return this.selectModel(task).cost || 0; }
  callModel(task, request, options={}) { return this.execute({task,messages:request.messages || request,model:options.model,parallel:options.parallel,maxCandidates:options.maxCandidates}); }
  getStats() { return {...this.stats,totalModels:this.registry.size(),capabilities:this.registry.list().flatMap(m=>m.capabilities)}; }
}
