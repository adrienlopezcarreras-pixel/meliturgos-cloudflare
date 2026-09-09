import { DomainError, requireValue } from '../core/contracts.js';
/** Trusted allowlist of exact HTTPS origins; reject redirects and private hosts.
 * search provider is injected; no invented results. fetch evidence cannot be forged by cite().
 */
export class WebTool {
  constructor({origins=[],fetcher=fetch,searchProvider}={}) { this.origins=new Set(origins); this.fetcher=fetcher; this.searchProvider=searchProvider; this.evidence=new WeakSet(); }
  async search(query) { if(!this.searchProvider) throw new DomainError('WEB_SEARCH_UNCONFIGURED',503); return this.searchProvider(query); }
  async fetch(url) {
    const u=new URL(url);
    requireValue(u.protocol==='https:' && !u.username && !u.password && this.origins.has(u.origin) && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname),'WEB_ORIGIN_DENIED',403);
    const r=await this.fetcher(u.href,{redirect:'error',signal:AbortSignal.timeout(8000)});
    requireValue(r.ok,'WEB_FETCH_FAILED',502);
    const reader=r.body.getReader(); const chunks=[]; let bytes=0;
    try { while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;requireValue(bytes<=1_000_000,'WEB_BODY_TOO_LARGE',413);chunks.push(value);} } finally {await reader.cancel();}
    const content=await new Blob(chunks).text();
    const result={content,provenance:{url:u.href,retrieved_at:Date.now(),method:'fetch',status:r.status}};
    this.evidence.add(result); return result;
  }
  extract(result) { requireValue(this.evidence.has(result),'PROVENANCE_REQUIRED'); return {text:result.content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').slice(0,12000),provenance:result.provenance}; }
  cite(result) { requireValue(this.evidence.has(result),'PROVENANCE_REQUIRED'); return {...result.provenance}; }
}
