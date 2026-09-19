const te = new TextEncoder();
const DAY = 24 * 60 * 60 * 1000;

function bytes(v){ if(v instanceof Uint8Array)return new Uint8Array(v); if(v instanceof ArrayBuffer)return new Uint8Array(v); if(ArrayBuffer.isView(v))return new Uint8Array(v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)); throw new TypeError('BYTES_REQUIRED'); }
function utf8(v){ return te.encode(String(v)); }
function b64u(v){ let s='';const a=bytes(v);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function parseJson(v,fallback){ try{return JSON.parse(v??JSON.stringify(fallback));}catch{return fallback;} }
function stable(v){ if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stable).join(',')}]`;return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`; }
function rid(n=18){ const a=new Uint8Array(n);crypto.getRandomValues(a);return b64u(a); }
function isPrivate4(h){ const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);if(!m)return false;const o=m.slice(1).map(Number);return o.some(x=>x>255)||o[0]===10||o[0]===127||o[0]===0||(o[0]===169&&o[1]===254)||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168); }
function publicHttps(value,label,{template=false}={}){ let u;try{u=new URL(template?String(value).replaceAll('{objectId}','probe'):String(value));}catch{throw new Error(`${label}_INVALID`)}const h=u.hostname.toLowerCase();if(u.protocol!=='https:')throw new Error(`${label}_HTTPS_REQUIRED`);if(u.username||u.password)throw new Error(`${label}_CREDENTIALS_FORBIDDEN`);if(h==='localhost'||h.endsWith('.local')||isPrivate4(h)||(h.includes(':')&&(h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80'))))throw new Error(`${label}_PRIVATE_NETWORK_FORBIDDEN`);return u; }
async function fetchTimed(url,options={},ms=10000){ const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,redirect:'error',signal:c.signal});}finally{clearTimeout(t);} }
async function hkdf(master,salt,info,len=32){ const k=await crypto.subtle.importKey('raw',bytes(master),'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:bytes(salt),info:bytes(info)},k,len*8)); }
async function hmac(key,payload){ const k=await crypto.subtle.importKey('raw',bytes(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(payload))); }

function normalize(raw, source){
  if(!raw||typeof raw!=='object')throw new Error('CANDIDATE_EMPTY');
  if(!/^[a-zA-Z0-9._-]{1,80}$/.test(String(raw.id||'')))throw new Error('CANDIDATE_ID_INVALID');
  if(!String(raw.urlTemplate||'').includes('{objectId}'))throw new Error('CANDIDATE_TEMPLATE_INVALID');
  const storage=publicHttps(raw.urlTemplate,'CANDIDATE_STORAGE',{template:true});
  const policy=raw.policyUrl?publicHttps(raw.policyUrl,'CANDIDATE_POLICY').toString():null;
  const reviewed=raw.policyReviewedAt?Date.parse(raw.policyReviewedAt):NaN;
  const method=String(raw.method||'PUT').toUpperCase();
  if(!['PUT','POST'].includes(method))throw new Error('CANDIDATE_METHOD_INVALID');
  return {
    id:String(raw.id),
    urlTemplate:String(raw.urlTemplate),
    method,
    maxBytes:Math.max(0,Number(raw.maxObjectBytes??raw.maxBytes??0)||0),
    operatorDomain:String(raw.operatorDomain||storage.hostname).toLowerCase(),
    providerId:String(raw.providerId||raw.operatorDomain||storage.hostname).toLowerCase(),
    jurisdiction:String(raw.jurisdiction||'UNKNOWN').toUpperCase(),
    policyUrl:policy,
    policyReviewedAt:Number.isFinite(reviewed)?new Date(reviewed).toISOString():null,
    expectedRetentionDays:Math.max(0,Number(raw.expectedRetentionDays||0)||0),
    authMode:String(raw.authMode||'none').toLowerCase(),
    anonymousWriteDeclared:raw.anonymousWriteDeclared===true,
    publicReadDeclared:raw.publicReadDeclared===true,
    automationAllowedDeclared:raw.automationAllowedDeclared===true,
    freeDeclared:raw.freeDeclared===true,
    writeProbeAllowed:raw.writeProbeAllowed===true,
    source,
  };
}

function eligible(c,{requiredBytes=0,policyMaxAgeDays=180}={}){
  const reasons=[];
  if(c.authMode!=='none')reasons.push('AUTH_REQUIRED');
  if(!c.anonymousWriteDeclared)reasons.push('ANONYMOUS_WRITE_NOT_DECLARED');
  if(!c.publicReadDeclared)reasons.push('PUBLIC_READ_NOT_DECLARED');
  if(!c.automationAllowedDeclared)reasons.push('AUTOMATION_NOT_DECLARED');
  if(!c.freeDeclared)reasons.push('FREE_USE_NOT_DECLARED');
  if(!c.writeProbeAllowed)reasons.push('WRITE_PROBE_NOT_ALLOWED');
  if(!c.policyUrl||!c.policyReviewedAt)reasons.push('POLICY_EVIDENCE_MISSING');
  else if(Date.now()-Date.parse(c.policyReviewedAt)>policyMaxAgeDays*DAY)reasons.push('POLICY_EVIDENCE_STALE');
  if(c.maxBytes<Math.max(256,requiredBytes))reasons.push('CAPACITY_TOO_SMALL');
  return {ok:reasons.length===0,reasons};
}

async function verifyFeed(master,vaultId,payload){
  if(!payload||payload.format!=='MEL-ShardVault-CandidateFeed'||payload.vaultId!==vaultId||!payload.feedMac||!Array.isArray(payload.candidates))return false;
  const {feedMac,...unsigned}=payload;
  const key=await hkdf(master,utf8(vaultId),utf8('MEL-ShardVault/v1/candidate-feed'));
  return b64u(await hmac(key,utf8(stable(unsigned))))===feedMac;
}

async function loadCandidates(env,master,vaultId){
  const accepted=[],rejected=[];
  const local=parseJson(env?.MEL_AUTONOMOUS_REPOSITORIES_JSON,[]);
  if(Array.isArray(local))for(const raw of local){try{accepted.push(normalize(raw,'configured'));}catch(error){rejected.push({source:'configured',id:raw?.id||null,reason:String(error?.message||error)});}}
  const feeds=parseJson(env?.MEL_AUTONOMOUS_FEEDS_JSON,[]);
  if(Array.isArray(feeds))for(const item of feeds){
    const url=typeof item==='string'?item:item?.url;
    try{
      const clean=publicHttps(url,'AUTONOMOUS_FEED').toString();
      const r=await fetchTimed(clean,{method:'GET'});if(!r.ok)throw new Error(`FEED_HTTP_${r.status}`);
      const payload=await r.json();if(!(await verifyFeed(master,vaultId,payload)))throw new Error('FEED_SIGNATURE_INVALID');
      for(const raw of payload.candidates){try{accepted.push(normalize(raw,clean));}catch(error){rejected.push({source:clean,id:raw?.id||null,reason:String(error?.message||error)});}}
    }catch(error){rejected.push({source:String(url||'unknown'),reason:String(error?.message||error)});}
  }
  const byId=new Map();for(const c of accepted)byId.set(c.id,c);
  return {candidates:[...byId.values()],rejected};
}

async function probe(c, requiredBytes){
  const policyStart=Date.now();
  const policy=await fetchTimed(c.policyUrl,{method:'GET'},8000);
  if(!policy.ok)throw new Error(`POLICY_HTTP_${policy.status}`);
  const policyLatency=Date.now()-policyStart;
  const payload=new Uint8Array(Math.min(c.maxBytes,Math.max(256,Math.min(requiredBytes||256,1024))));crypto.getRandomValues(payload);
  const objectId=`mel-probe-${rid(12)}`;
  const url=publicHttps(c.urlTemplate.replaceAll('{objectId}',encodeURIComponent(objectId)),'AUTONOMOUS_TARGET').toString();
  const writeStart=Date.now();
  const w=await fetchTimed(url,{method:c.method,headers:{'content-type':'application/octet-stream','x-mel-shardvault-probe':'1'},body:payload},10000);
  if(!w.ok)throw new Error(`WRITE_HTTP_${w.status}`);
  const writeLatency=Date.now()-writeStart;
  const readStart=Date.now();
  const r=await fetchTimed(url,{method:'GET'},10000);if(!r.ok)throw new Error(`READ_HTTP_${r.status}`);
  const got=new Uint8Array(await r.arrayBuffer());const readLatency=Date.now()-readStart;
  if(got.length!==payload.length)throw new Error('PROBE_LENGTH_MISMATCH');
  let diff=0;for(let i=0;i<got.length;i++)diff|=got[i]^payload[i];if(diff)throw new Error('PROBE_CONTENT_MISMATCH');
  const latency=writeLatency+readLatency;
  const latencyScore=latency<=500?20:latency<=1500?15:latency<=4000?10:5;
  const retentionScore=Math.min(20,Math.round((Math.min(c.expectedRetentionDays,30)/30)*20));
  const score=60+latencyScore+retentionScore;
  return {...c,score,confidence:50,probe:{ok:true,objectId,policyLatencyMs:policyLatency,writeLatencyMs:writeLatency,readLatencyMs:readLatency,checkedAt:new Date().toISOString()}};
}

function choose(candidates,count,maxPerOperator,maxPerProvider){
  const ranked=[...candidates].sort((a,b)=>b.score-a.score||b.confidence-a.confidence||a.id.localeCompare(b.id)),selected=[],ids=new Set(),ops=new Map(),provs=new Map();
  const can=(c,uniqueOp=false,uniqueProv=false)=>!ids.has(c.id)&&(ops.get(c.operatorDomain)||0)<maxPerOperator&&(provs.get(c.providerId)||0)<maxPerProvider&&(!uniqueOp||(ops.get(c.operatorDomain)||0)===0)&&(!uniqueProv||(provs.get(c.providerId)||0)===0);
  const add=c=>{selected.push(c);ids.add(c.id);ops.set(c.operatorDomain,(ops.get(c.operatorDomain)||0)+1);provs.set(c.providerId,(provs.get(c.providerId)||0)+1);};
  for(const c of ranked){if(can(c,true,true))add(c);if(selected.length>=count)return selected;}
  for(const c of ranked){if(can(c,true,false))add(c);if(selected.length>=count)return selected;}
  for(const c of ranked){if(can(c,false,false))add(c);if(selected.length>=count)break;}
  return selected;
}

export async function discoverAutonomousRepositories(env,{masterKey,vaultId,requiredBytes=0,selectionCount=7}={}){
  const master=bytes(masterKey);if(master.length<32)throw new Error('AUTONOMOUS_MASTER_KEY_INVALID');
  const loaded=await loadCandidates(env,master,String(vaultId));
  const policyMaxAgeDays=Math.max(1,Number(env?.MEL_AUTONOMOUS_POLICY_MAX_AGE_DAYS)||180);
  const probeLimit=Math.max(selectionCount,Math.min(50,Number(env?.MEL_AUTONOMOUS_PROBE_LIMIT)||14));
  const maxPerOperator=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_OPERATOR)||2);
  const maxPerProvider=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_PROVIDER)||2);
  const eligibleRows=[],rejected=[...loaded.rejected];
  for(const c of loaded.candidates){const e=eligible(c,{requiredBytes,policyMaxAgeDays});if(e.ok)eligibleRows.push(c);else rejected.push({source:c.source,id:c.id,reason:e.reasons.join(',')});}
  const probed=[];
  for(const c of eligibleRows.slice(0,probeLimit)){try{probed.push(await probe(c,requiredBytes));}catch(error){rejected.push({source:c.source,id:c.id,reason:String(error?.message||error)});}}
  const selected=choose(probed,selectionCount,maxPerOperator,maxPerProvider);
  return {
    selected: selected.map(c=>({id:c.id,urlTemplate:c.urlTemplate,method:c.method,maxBytes:c.maxBytes,operatorDomain:c.operatorDomain,providerId:c.providerId,jurisdiction:c.jurisdiction,score:c.score,confidence:c.confidence,autonomous:true,authMode:'none'})),
    rejected,
    discovered:loaded.candidates.length,
    probed:probed.length,
    diversity:{selected:selected.length,uniqueOperators:new Set(selected.map(c=>c.operatorDomain)).size,uniqueProviders:new Set(selected.map(c=>c.providerId)).size,uniqueJurisdictions:new Set(selected.map(c=>c.jurisdiction).filter(x=>x!=='UNKNOWN')).size},
  };
}

export const __autonomousTest = Object.freeze({ normalize, eligible, choose });
