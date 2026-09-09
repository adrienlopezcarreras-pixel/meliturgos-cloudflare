import { requireValue } from '../core/contracts.js';
export class ModelRegistry {
  constructor(models = []) { this.models=new Map(); for (const model of models) this.register(model); }
  register(model) {
    requireValue(model?.id && Array.isArray(model.capabilities),'INVALID_MODEL');
    const record={provider:'workers-ai',model_id:model.id,context:null,tools:false,vision:false,audio:false,structured:false,cost:null,latency:null,health:'UNKNOWN',enabled:true,priority:0,...model};
    this.models.set(model.id,structuredClone(record)); return this.get(model.id);
  }
  get(id) { const m=this.models.get(id); return m ? structuredClone(m) : null; }
  list() { return [...this.models.values()].map(m=>structuredClone(m)); }
  update(id, patch) { const m=this.get(id); requireValue(m,'MODEL_NOT_FOUND',404); return this.register({...m,...patch,id}); }
  disable(id) { return this.update(id,{enabled:false}); }
  health(id) { return this.get(id)?.health || 'UNKNOWN'; }
  modelsByCapability(capability) { return this.list().filter(m=>m.enabled && m.health!=='UNAVAILABLE' && m.capabilities.includes(capability)).sort((a,b)=>b.priority-a.priority); }
  getByCapabilities(caps,limit=10) { caps=Array.isArray(caps)?caps:[caps]; return this.list().filter(m=>m.enabled && caps.every(c=>m.capabilities.includes(c))).slice(0,limit); }
  size() { return this.models.size; }
}
// Existing configured IDs, availability deliberately UNKNOWN until a real successful call.
export const standardRegistry = new ModelRegistry([
 {id:'@cf/zai-org/glm-4.7-flash',capabilities:['GENERAL','FAST','STEERABLE','FALLBACK'],priority:30},
 {id:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',capabilities:['GENERAL','REASONING','CODE','FALLBACK'],priority:20},
 {id:'@cf/google/gemma-3-12b-it',capabilities:['GENERAL','CODE','FALLBACK'],priority:10}
 ,{id:'ninjachat-default',provider:'ninjachat',model_id:'ninjachat-default',capabilities:['GENERAL','REASONING','STEERABLE','FALLBACK'],priority:-100,health:'UNKNOWN',enabled:true,role_general:true,role_reasoning:true,role_steerable:true,fallback_final:true}
]);
