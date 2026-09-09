import { DomainError, requireValue } from '../core/contracts.js';
export const AUTH_TYPES = Object.freeze(['NONE','API_KEY','OAUTH2','SERVICE_ACCOUNT']);
export const CONNECTOR_STATES = Object.freeze(['UNCONFIGURED','CONFIGURED','AUTH_REQUIRED','CONNECTED','DEGRADED','ERROR','DISABLED']);
/** Credentials resolved inside adapter; public record contains environment key names only.
 * Probe endpoint is fixed by trusted adapter. Client cannot override URL or headers.
 */
export class Connector {
  constructor(definition,{env={},fetcher=fetch}={}) { this.definition=structuredClone(definition); this.env=env; this.fetcher=fetcher; this.state='UNCONFIGURED'; this.checkedAt=null; }
  status() { return {id:this.definition.id,provider:this.definition.provider,auth_type:this.definition.auth_type,capabilities:[...this.definition.capabilities],secret_references:[...this.definition.secret_references],status:this.state,health:this.checkedAt?'CHECKED':'UNKNOWN',metadata:{auth_verified_at:this.checkedAt},created_at:this.definition.created_at || null,updated_at:this.checkedAt}; }
  configure() { this.state=this.definition.auth_type==='NONE' || this.definition.secret_references.some(key=>Boolean(this.env[key])) ? 'CONFIGURED':'AUTH_REQUIRED'; return this.status(); }
  disconnect() { this.state='DISABLED'; this.checkedAt=null; return this.status(); }
  listCapabilities() { return [...this.definition.capabilities]; }
  async connect() { const report=await this.health(); this.state=report.STATUS; if (report.AUTH_VALID==='YES') this.checkedAt=Date.now(); return this.status(); }
  async health() { return testConnection(this.definition,{env:this.env,fetcher:this.fetcher,mode:'REAL'}); }
  async execute() { throw new DomainError('NOT_IMPLEMENTED:connector.execute'); }
}
export async function testConnection(def,{env={},fetcher=fetch,mode='MOCK'}={}) {
  requireValue(['MOCK','REAL'].includes(mode),'INVALID_MODE');
  const present=def.auth_type==='NONE' || def.secret_references.every(key=>Boolean(env[key]));
  const report={CONNECTOR:def.id.toUpperCase(),MODE:mode,CONFIG_PRESENT:'YES',AUTH_PRESENT:present?'YES':'NO',NETWORK_REACHABLE:'NOT_TESTED',API_REACHABLE:'NOT_TESTED',AUTH_VALID:'NOT_TESTED',CAPABILITIES:def.capabilities.join(','),STATUS:present?'CONFIGURED':'AUTH_REQUIRED'};
  if (mode==='MOCK') return {...report,NETWORK_REACHABLE:'MOCK',API_REACHABLE:'MOCK'};
  // Read-only fixed API probe, no redirect credential forwarding, no body/log emission.
  try {
    const headers=present && def.auth_type!=='NONE'?{authorization:'Bearer '+env[def.secret_references[0]]}:{};
    const response=await fetcher(def.probe,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(8000)});
    report.NETWORK_REACHABLE='YES'; report.API_REACHABLE=response.status<500?'YES':'NO';
    report.AUTH_VALID=present?(response.ok?'YES':response.status===401||response.status===403?'NO':'NOT_TESTED'):'NOT_TESTED';
    report.STATUS=report.AUTH_VALID==='YES'?'CONNECTED':!present||report.AUTH_VALID==='NO'?'AUTH_REQUIRED':response.status===429?'DEGRADED':'ERROR';
    await response.body?.cancel();
  } catch { report.NETWORK_REACHABLE='NO'; report.STATUS='ERROR'; }
  return report;
}
