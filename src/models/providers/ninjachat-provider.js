import { DomainError, requireValue } from '../../core/contracts.js';
export class NinjaChatHealthCheck {
  constructor({endpoint, secretRef}={}) { this.endpoint=endpoint; this.secretRef=secretRef; }
  async health() { return { provider:'ninjachat', configured:Boolean(this.endpoint&&this.secretRef), status:this.endpoint&&this.secretRef?'UNKNOWN':'BLOCKED_EXTERNAL_API' }; }
}
export class NinjaChatAdapter {
  constructor({endpoint, secretRef, fetcher=fetch}={}) { this.endpoint=endpoint; this.secretRef=secretRef; this.fetcher=fetcher; }
  capabilities() { return ['GENERAL','REASONING','STEERABLE','FALLBACK']; }
  async health() { return new NinjaChatHealthCheck(this).health(); }
  normalizeError(error) { return { code:'provider_unavailable', provider:'ninjachat', cause:error?.message||String(error) }; }
  async complete({messages, model='ninjachat-default'}={}) {
    requireValue(this.endpoint&&this.secretRef,'NINJACHAT_BLOCKED_EXTERNAL_API',503);
    const response=await this.fetcher(this.endpoint,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${this.secretRef}`},body:JSON.stringify({model,messages})});
    if(!response.ok) throw new DomainError('provider_unavailable',502);
    const body=await response.json(); const text=body?.response||body?.text||body?.choices?.[0]?.message?.content;
    requireValue(typeof text==='string'&&text.trim(),'provider_unavailable',502); return {text:text.trim(),provider:'ninjachat',model};
  }
  async stream(input) { return this.complete(input); }
}
export class NinjaChatProvider extends NinjaChatAdapter {}
