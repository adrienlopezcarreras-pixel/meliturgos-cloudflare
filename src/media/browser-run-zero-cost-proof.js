export const BROWSER_RUN_ZERO_COST_PROOF_SCHEMA='mel.browser-run.zero-cost-proof/v1';
export const BROWSER_RUN_ZERO_COST_PROOF_MAX_AGE_MS=60*60*1000;
function clean(v){return typeof v==='string'?v.trim():'';}
function parse(raw){if(!raw)return null;if(typeof raw==='object'&&!Array.isArray(raw))return raw;try{const x=JSON.parse(String(raw));return x&&typeof x==='object'&&!Array.isArray(x)?x:null}catch{return null}}
export function browserRunZeroCostProvenance(env={}, {now=Date.now()}={}){
  const p=parse(env.MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON);if(!p)return null;
  if(clean(p.schema)!==BROWSER_RUN_ZERO_COST_PROOF_SCHEMA)return null;
  if(clean(p.provider)!=='cloudflare-browser-run'||clean(p.account_plan)!=='WORKERS_FREE')return null;
  if(clean(p.overage_behavior)!=='HARD_LIMIT_NO_BILLING')return null;
  const a=Date.parse(String(p.verified_at||'')),b=Date.parse(String(p.expires_at||'')),n=Number(now);
  if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(n)||a>n+60000||b<=n||b<=a||b-a>BROWSER_RUN_ZERO_COST_PROOF_MAX_AGE_MS)return null;
  return Object.freeze({verified:true,addedCost:0,source:'cloudflare-browser-run-free-proof',evidence:Object.freeze({
    account_plan:'WORKERS_FREE',included_minutes_per_day:Number(p.included_minutes_per_day||0),overage_behavior:'HARD_LIMIT_NO_BILLING',verified_at:new Date(a).toISOString(),expires_at:new Date(b).toISOString(),documentation_url:clean(p.documentation_url)
  })});
}
