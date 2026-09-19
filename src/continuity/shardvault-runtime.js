import { buildShardVaultMemoryPayload } from './shardvault-memory-export.js';
import { discoverAutonomousRepositories } from './autonomous-repositories.js';

const te = new TextEncoder();
const HOUR = 60 * 60 * 1000;

function bytes(v){ if(v instanceof Uint8Array)return new Uint8Array(v); if(v instanceof ArrayBuffer)return new Uint8Array(v); if(ArrayBuffer.isView(v))return new Uint8Array(v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)); throw new TypeError('BYTES_REQUIRED'); }
function utf8(v){ return te.encode(String(v)); }
function concat(...parts){ const a=parts.map(bytes),n=a.reduce((s,x)=>s+x.length,0),out=new Uint8Array(n);let o=0;for(const x of a){out.set(x,o);o+=x.length;}return out; }
function b64u(v){ let s='';const a=bytes(v);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function b64(v){ let s='';const a=bytes(v);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s); }
function unb64(v){ const raw=atob(String(v||'').trim());return Uint8Array.from(raw,c=>c.charCodeAt(0)); }
function unb64u(v){ const n=String(v||'').replaceAll('-','+').replaceAll('_','/');const s=atob(n+'='.repeat((4-n.length%4)%4));return Uint8Array.from(s,c=>c.charCodeAt(0)); }
function rid(n=18){ const a=new Uint8Array(n);crypto.getRandomValues(a);return b64u(a); }
function stable(v){ if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stable).join(',')}]`;return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`; }
function parseJson(v,fallback){ try{return JSON.parse(v??JSON.stringify(fallback));}catch{return fallback;} }
function isPrivate4(h){ const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);if(!m)return false;const o=m.slice(1).map(Number);return o.some(x=>x>255)||o[0]===10||o[0]===127||o[0]===0||(o[0]===169&&o[1]===254)||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168); }
function publicUrl(value,label,template=false){ let u;try{u=new URL(template?String(value).replaceAll('{objectId}','probe'):String(value));}catch{throw new Error(`${label}_INVALID`)}const h=u.hostname.toLowerCase();if(u.protocol!=='https:')throw new Error(`${label}_HTTPS_REQUIRED`);if(u.username||u.password)throw new Error(`${label}_CREDENTIALS_FORBIDDEN`);if(h==='localhost'||h.endsWith('.local')||isPrivate4(h)||(h.includes(':')&&(h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80'))))throw new Error(`${label}_PRIVATE_NETWORK_FORBIDDEN`);return u; }
async function fetchTimed(url,options={},ms=12000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{
    let current=String(url),opts={...options};
    for(let hop=0;hop<4;hop++){
      const method=String(opts.method||'GET').toUpperCase();
      const r=await fetch(current,{...opts,redirect:'manual',signal:c.signal});
      if(![301,302,303,307,308].includes(r.status))return r;
      if(method!=='GET'&&method!=='HEAD')return r;
      const location=r.headers.get('location');
      if(!location)return r;
      current=publicUrl(new URL(location,current).toString(),'RUNTIME_REDIRECT');
      if(r.status===303)opts={...opts,method:'GET',body:undefined};
    }
    throw new Error('REDIRECT_LIMIT');
  }finally{clearTimeout(t);}
}
async function fetchRateAware(url,options={},ms=12000,attempts=3){
  let last=null;
  for(let attempt=0;attempt<attempts;attempt++){
    last=await fetchTimed(url,options,ms);
    if(last.status!==429)return last;
    if(attempt===attempts-1)return last;
    const raw=String(last.headers.get('retry-after')||'').trim();
    let delay=1500*(attempt+1);
    if(/^\d+$/.test(raw))delay=Math.max(delay,Number(raw)*1000);
    else if(raw){const at=Date.parse(raw);if(Number.isFinite(at))delay=Math.max(delay,at-Date.now());}
    await new Promise(resolve=>setTimeout(resolve,Math.max(500,Math.min(20000,delay))));
  }
  return last;
}
async function hkdf(master,salt,info,len=32){ const k=await crypto.subtle.importKey('raw',bytes(master),'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:bytes(salt),info:bytes(info)},k,len*8)); }
async function hmac(key,payload){ const k=await crypto.subtle.importKey('raw',bytes(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(payload))); }
async function encrypt(master,snapshotId,plain,iv){ const raw=await hkdf(master,utf8(snapshotId),utf8('MEL-ShardVault/v1/aes-gcm'));const k=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']);return new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8(snapshotId)},k,plain)); }
async function decrypt(master,snapshotId,cipher,iv){ const raw=await hkdf(master,utf8(snapshotId),utf8('MEL-ShardVault/v1/aes-gcm'));const k=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:utf8(snapshotId)},k,cipher)); }

const EXP=new Uint8Array(512),LOG=new Uint16Array(256);{let v=1;for(let i=0;i<255;i++){EXP[i]=v;LOG[v]=i;v<<=1;if(v&0x100)v^=0x11d;}for(let i=255;i<512;i++)EXP[i]=EXP[i-255];}
function mul(a,b){return !a||!b?0:EXP[LOG[a]+LOG[b]];}function inv(a){if(!a)throw new Error('GF_ZERO');return EXP[255-LOG[a]];}function pow(a,e){if(!e)return 1;if(!a)return 0;return EXP[(LOG[a]*e)%255];}
function invert(input){const n=input.length,a=input.map((r,ri)=>[...r,...Array.from({length:n},(_,ci)=>ri===ci?1:0)]);for(let c=0;c<n;c++){let p=c;while(p<n&&!a[p][c])p++;if(p===n)throw new Error('RS_SINGULAR');if(p!==c)[a[p],a[c]]=[a[c],a[p]];const ip=inv(a[c][c]);for(let i=0;i<n*2;i++)a[c][i]=mul(a[c][i],ip);for(let r=0;r<n;r++){if(r===c)continue;const f=a[r][c];if(!f)continue;for(let i=0;i<n*2;i++)a[r][i]^=mul(f,a[c][i]);}}return a.map(r=>r.slice(n));}
function generator(k,n){if(!Number.isInteger(k)||!Number.isInteger(n)||k<1||n<=k||n>255)throw new Error('RS_PARAMS_INVALID');const v=Array.from({length:n},(_,r)=>Array.from({length:k},(_,c)=>pow(r+1,c))),top=invert(v.slice(0,k));return v.map(r=>Array.from({length:k},(_,c)=>r.reduce((s,x,i)=>s^mul(x,top[i][c]),0)));}
function encode(data,n){const k=data.length,size=data[0]?.length||0;if(!k||!size)throw new Error('RS_DATA_EMPTY');const g=generator(k,n),out=data.map(x=>new Uint8Array(x));for(let r=k;r<n;r++){const p=new Uint8Array(size);for(let s=0;s<k;s++){const c=g[r][s];if(!c)continue;for(let i=0;i<size;i++)p[i]^=mul(c,data[s][i]);}out.push(p);}return out;}
function decode(available,k,n,size){const idx=available.map((x,i)=>x?i:-1).filter(i=>i>=0);if(idx.length<k)throw new Error(`SHARDS_INSUFFICIENT_${idx.length}_${k}`);const g=generator(k,n),sel=idx.slice(0,k),inverse=invert(sel.map(i=>g[i].slice())),data=[];for(let d=0;d<k;d++){const out=new Uint8Array(size);for(let s=0;s<k;s++){const c=inverse[d][s];if(!c)continue;const src=available[sel[s]];for(let i=0;i<size;i++)out[i]^=mul(c,src[i]);}data.push(out);}return encode(data,n);}

function normalizeEndpoint(e,i){ if(!e?.id||!String(e.urlTemplate||'').includes('{objectId}'))throw new Error(`ENDPOINT_${i}_INVALID`);const probe=publicUrl(e.urlTemplate,`ENDPOINT_${e.id}`,true),method=String(e.method||'PUT').toUpperCase();if(!['PUT','POST'].includes(method))throw new Error(`ENDPOINT_${e.id}_METHOD`);return {id:String(e.id),urlTemplate:String(e.urlTemplate),method,maxBytes:Number(e.maxBytes)||8*1024*1024,operatorDomain:String(e.operatorDomain||probe.hostname).toLowerCase(),providerId:String(e.providerId||e.operatorDomain||probe.hostname).toLowerCase(),jurisdiction:String(e.jurisdiction||'UNKNOWN').toUpperCase(),score:Number.isFinite(Number(e.score))?Number(e.score):0,confidence:Number.isFinite(Number(e.confidence))?Number(e.confidence):0,adapter:e.adapter||null,evidenceMode:e.evidenceMode||null,evidenceVerification:e.evidenceVerification||null,verifiedAt:e.verifiedAt||null,probeLatencyMs:Number(e.probeLatencyMs)||0,expectedRetentionDays:Number(e.expectedRetentionDays)||0,retentionModel:e.retentionModel||'fixed',baseRetentionDays:Number(e.baseRetentionDays)||Number(e.expectedRetentionDays)||0,refreshEveryDays:Number(e.refreshEveryDays)||0,fullReadRenewsRetention:e.fullReadRenewsRetention===true,autonomous:e.autonomous===true,authMode:e.authMode||null}; }
function selectEndpoints(endpoints,count,maxPerOperator=2,maxPerProvider=2){const ranked=[...endpoints].sort((a,b)=>b.score-a.score||b.confidence-a.confidence||a.id.localeCompare(b.id)),selected=[],ids=new Set(),op=new Map(),prov=new Map();const can=(e,uo=false,up=false)=>!ids.has(e.id)&&(op.get(e.operatorDomain)||0)<maxPerOperator&&(prov.get(e.providerId)||0)<maxPerProvider&&(!uo||(op.get(e.operatorDomain)||0)===0)&&(!up||(prov.get(e.providerId)||0)===0);const add=e=>{selected.push(e);ids.add(e.id);op.set(e.operatorDomain,(op.get(e.operatorDomain)||0)+1);prov.set(e.providerId,(prov.get(e.providerId)||0)+1);};for(const e of ranked){if(can(e,true,true))add(e);if(selected.length>=count)return selected;}for(const e of ranked){if(can(e,true,false))add(e);if(selected.length>=count)return selected;}for(const e of ranked){if(can(e,false,false))add(e);if(selected.length>=count)break;}return selected;}
function diversity(endpoints){return {selected:endpoints.length,uniqueOperators:new Set(endpoints.map(e=>e.operatorDomain)).size,uniqueProviders:new Set(endpoints.map(e=>e.providerId)).size,uniqueJurisdictions:new Set(endpoints.map(e=>e.jurisdiction).filter(x=>x&&x!=='UNKNOWN')).size,fallbackUsed:new Set(endpoints.map(e=>e.operatorDomain)).size<endpoints.length};}
function endpointSnapshot(e){return {backend:e.backend||'http',urlTemplate:e.urlTemplate||null,keyPrefix:e.keyPrefix||null,bucketName:e.bucketName||null,method:e.method||'PUT',maxBytes:e.maxBytes,operatorDomain:e.operatorDomain,providerId:e.providerId,jurisdiction:e.jurisdiction,score:e.score,confidence:e.confidence,autonomous:e.autonomous===true,authMode:e.authMode||null,adapter:e.adapter||null,evidenceMode:e.evidenceMode||null,evidenceVerification:e.evidenceVerification||null,verifiedAt:e.verifiedAt||null,probeLatencyMs:Number(e.probeLatencyMs)||0,expectedRetentionDays:Number(e.expectedRetentionDays)||0,retentionModel:e.retentionModel||'fixed',baseRetentionDays:Number(e.baseRetentionDays)||Number(e.expectedRetentionDays)||0,refreshEveryDays:Number(e.refreshEveryDays)||0,fullReadRenewsRetention:e.fullReadRenewsRetention===true};}
function mergeAutonomous(c,report,env){
  if(!report?.selected?.length)return c;
  const by=new Map(c.allEndpoints.map(e=>[e.id,e]));
  for(const e of report.selected)by.set(e.id,e);
  const all=[...by.values()],maxOp=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_OPERATOR)||2),maxProv=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_PROVIDER)||2);
  const external=report.selected.filter(e=>!e.backend);
  if(external.length>=c.n){
    return {...c,allEndpoints:all,endpoints:selectEndpoints(external,c.n,maxOp,maxProv),storageMode:'EXTERNAL_DISTRIBUTED',degraded:false};
  }
  const externalFirst=[...external,...all.filter(e=>e.backend)];
  return {...c,allEndpoints:all,endpoints:selectEndpoints(externalFirst,Math.min(c.n,externalFirst.length),maxOp,maxProv)};
}
function extendActiveEndpoints(current,candidates,limit=7,maxPerOperator=2,maxPerProvider=2){
  const out=[],ids=new Set(),ops=new Map(),provs=new Map();
  const add=e=>{out.push(e);ids.add(e.id);ops.set(e.operatorDomain,(ops.get(e.operatorDomain)||0)+1);provs.set(e.providerId,(provs.get(e.providerId)||0)+1);};
  for(const e of current||[]){
    if(!e?.id||ids.has(e.id)||out.length>=limit)continue;
    add(e);
  }
  for(const e of candidates||[]){
    if(!e?.id||ids.has(e.id)||out.length>=limit)continue;
    if((ops.get(e.operatorDomain)||0)>=maxPerOperator||(provs.get(e.providerId)||0)>=maxPerProvider)continue;
    add(e);
  }
  return out;
}
async function enrichAutonomous(env,c,requiredBytes){
  let active=[];
  try{active=await readActiveExternalEndpoints(env);}catch{}
  const activeBoosted=active.map((e,i)=>({...e,score:1000000-i,activeRegistry:true}));
  if(String(env?.MEL_SHARDVAULT_AUTONOMOUS||'true')!=='true'){
    return {config:activeBoosted.length?mergeAutonomous(c,{selected:activeBoosted},env):c,report:null};
  }
  try{
    const report=await discoverAutonomousRepositories(env,{masterKey:c.master,vaultId:c.vaultId,requiredBytes,selectionCount:c.n});
    const by=new Map();
    for(const e of activeBoosted)by.set(e.id,e);
    for(const e of (report?.selected||[]))if(!by.has(e.id))by.set(e.id,e);
    report.selected=[...by.values()];
    const preferred=await readPreferredEndpoint(env);
    if(preferred?.endpoint_id&&Array.isArray(report?.selected)){
      report.selected=report.selected.map(e=>String(e?.id||'')===preferred.endpoint_id?{...e,score:(Number(e.score)||0)+100000,preferred:true}:e);
    }
    return {config:mergeAutonomous(c,report,env),report};
  }catch(error){
    const configWithActive=activeBoosted.length?mergeAutonomous(c,{selected:activeBoosted},env):c;
    return {config:configWithActive,report:{error:String(error?.message||error),selected:activeBoosted,rejected:[]}};
  }
}
async function recoveryMaster(env){
  const encoded=String(env?.MEL_RECOVERY_KEY||'').trim();
  if(encoded){
    const master=unb64u(encoded);
    if(master.length<32)throw new Error('MEL_RECOVERY_KEY_TOO_SHORT');
    return {master,keySource:'MEL_RECOVERY_KEY'};
  }
  const fallback=String(env?.MELITURGOS_PASSWORD||'');
  if(!fallback)throw new Error('RECOVERY_SECRET_MISSING');
  const digest=await crypto.subtle.digest('SHA-256',utf8('MEL-ShardVault/v1/recovery:'+fallback));
  return {master:new Uint8Array(digest),keySource:'MELITURGOS_PASSWORD_DERIVED'};
}
function r2FallbackEndpoint(){
  return {
    id:'cloudflare-r2-primary',
    backend:'r2',
    keyPrefix:'shardvault/objects/',
    bucketName:'meliturgos-private-media',
    method:'PUT',
    maxBytes:128*1024*1024,
    operatorDomain:'cloudflare.com',
    providerId:'cloudflare-r2',
    jurisdiction:'UNKNOWN',
    score:50,
    confidence:100,
    autonomous:false,
    authMode:'binding'
  };
}
function d1FallbackEndpoint(){
  return {
    id:'cloudflare-d1-secondary',
    backend:'d1',
    keyPrefix:'shardvault_objects',
    method:'PUT',
    maxBytes:1024*1024,
    operatorDomain:'cloudflare.com',
    providerId:'cloudflare-d1',
    jurisdiction:'UNKNOWN',
    score:45,
    confidence:100,
    autonomous:false,
    authMode:'binding'
  };
}
async function config(env){
  const k=Math.max(2,Number(env.MEL_DATA_SHARDS)||4),n=Math.max(3,Number(env.MEL_TOTAL_SHARDS)||7);
  if(n<=k)return {ok:false,missing:['MEL_TOTAL_SHARDS(>MEL_DATA_SHARDS)']};
  let masterInfo;
  try{masterInfo=await recoveryMaster(env);}catch(error){return {ok:false,missing:[String(error?.message||error)]};}
  const raw=parseJson(env?.MEL_PUBLIC_ENDPOINTS_JSON,[]);
  const hasHttp=Array.isArray(raw)&&raw.length&&env?.MEL_INVENTORY_APPEND_URL&&env?.MEL_INVENTORY_LIST_URL;
  let all=[],storageMode='HTTP_DISTRIBUTED',degraded=false;
  if(hasHttp){
    all=raw.map(normalizeEndpoint);
    publicUrl(env.MEL_INVENTORY_APPEND_URL,'INVENTORY_APPEND');
    publicUrl(env.MEL_INVENTORY_LIST_URL,'INVENTORY_LIST');
  }else{
    if(env?.MEDIA_BUCKET?.put&&env?.MEDIA_BUCKET?.get&&env?.MEDIA_BUCKET?.list)all.push(r2FallbackEndpoint());
    if(env?.DB?.prepare)all.push(d1FallbackEndpoint());
    if(all.length){
      storageMode='CLOUDFLARE_FALLBACK';
      degraded=true;
    }else{
      return {ok:false,missing:['MEL_PUBLIC_ENDPOINTS_JSON or MEDIA_BUCKET/DB','MEL_INVENTORY_APPEND_URL','MEL_INVENTORY_LIST_URL']};
    }
  }
  const selected=selectEndpoints(all,Math.min(n,all.length),Math.max(1,Number(env.MEL_WATCH_MAX_PER_OPERATOR)||2),Math.max(1,Number(env.MEL_WATCH_MAX_PER_PROVIDER)||2));
  return {ok:true,master:masterInfo.master,keySource:masterInfo.keySource,allEndpoints:all,endpoints:selected,vaultId:String(env.MEL_VAULT_ID||'mel-primary'),k,n,intervalMs:Math.max(HOUR,Number(env.MEL_SHARDVAULT_INTERVAL_HOURS||24)*HOUR),storageMode,degraded};
}
function unsignedManifest(m){const {manifestMac:_mac,...u}=m;return u;}
async function manifestMac(c,m){const key=await hkdf(c.master,utf8(c.vaultId),utf8('MEL-ShardVault/v1/manifest-mac'));return b64u(await hmac(key,utf8(stable(unsignedManifest(m)))));}
async function validManifest(c,m){if(!m||m.vaultId!==c.vaultId||m.format!=='MEL-ShardVault'||!m.manifestMac)return false;try{return (await manifestMac(c,m))===m.manifestMac;}catch{return false;}}
function r2ManifestPrefix(c){return 'shardvault/manifests/'+encodeURIComponent(c.vaultId)+'/';}
async function inventoryRows(env,c){
  if(c.storageMode==='CLOUDFLARE_FALLBACK'||c.storageMode==='EXTERNAL_DISTRIBUTED'){
    const out=[];let cursor=undefined,seen=0;
    do{
      const listed=await env.MEDIA_BUCKET.list({prefix:r2ManifestPrefix(c),cursor,limit:1000});
      for(const object of listed?.objects||[]){
        if(++seen>5000)break;
        const body=await env.MEDIA_BUCKET.get(object.key);
        if(!body)continue;
        try{const m=JSON.parse(await body.text());if(await validManifest(c,m))out.push(m);}catch{}
      }
      cursor=listed?.truncated?listed.cursor:undefined;
    }while(cursor&&seen<=5000);
    return out;
  }
  const r=await fetchTimed(env.MEL_INVENTORY_LIST_URL,{method:'GET'});
  if(!r.ok)throw new Error(`INVENTORY_LIST_${r.status}`);
  const x=await r.json(),rows=Array.isArray(x)?x:x?.items,out=[];
  for(const m of Array.isArray(rows)?rows:[])if(await validManifest(c,m))out.push(m);
  return out;
}
function latestSnapshot(rows){const by=new Map();for(const m of rows){const p=by.get(m.snapshotId);if(!p||(m.revision||0)>(p.revision||0))by.set(m.snapshotId,m);}return [...by.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null;}
function endpointById(c,id,d=null){const found=c.allEndpoints.find(e=>e.id===id);if(found)return found;const x=d?.endpoint;if(x?.backend==='r2'||x?.backend==='d1')return {id,...x};if(!x?.urlTemplate)return null;try{return normalizeEndpoint({id,...x},0);}catch{return null;}}
function fixedApiUrl(value){
  const u=new URL(String(value));
  u.searchParams.delete('mel_object');
  return u.toString();
}
function responseRemoteUrl(raw,headers,base){
  const text=String(raw||'').trim();
  let data=null;try{data=JSON.parse(text);}catch{}
  const candidates=[
    data?.raw_url,data?.rawUrl,data?.url,data?.link,data?.download_url,data?.downloadUrl,
    data?.paste?.raw_url,data?.paste?.rawUrl,data?.paste?.url,data?.data?.raw_url,data?.data?.url,
    data?.file?.url,Array.isArray(data?.files)?data.files[0]?.url:null,
    headers?.get?.('location'),text.startsWith('https://')?text:null
  ].filter(Boolean);
  if(!candidates.length)throw new Error('WRITE_REMOTE_URL_MISSING');
  return publicUrl(new URL(String(candidates[0]),base).toString(),'WRITE_REMOTE_URL').toString();
}
async function upload(env,e,objectId,payload){
  if(payload.length>e.maxBytes)throw new Error(`ENDPOINT_${e.id}_MAX_BYTES`);
  if(e.backend==='r2'){
    if(!env?.MEDIA_BUCKET?.put)throw new Error('R2_BINDING_UNAVAILABLE');
    await env.MEDIA_BUCKET.put(String(e.keyPrefix||'shardvault/objects/')+objectId,payload,{httpMetadata:{contentType:'application/octet-stream'}});
    return;
  }
  if(e.backend==='d1'){
    if(!env?.DB?.prepare)throw new Error('D1_BINDING_UNAVAILABLE');
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS shardvault_objects (object_id TEXT PRIMARY KEY, payload_b64 TEXT NOT NULL, byte_length INTEGER NOT NULL, created_at TEXT NOT NULL)').run();
    await env.DB.prepare('INSERT OR REPLACE INTO shardvault_objects (object_id,payload_b64,byte_length,created_at) VALUES (?,?,?,?)').bind(objectId,b64u(payload),payload.length,new Date().toISOString()).run();
    return null;
  }
  const u=publicUrl(e.urlTemplate.replaceAll('{objectId}',encodeURIComponent(objectId)),`WRITE_${e.id}`);
  if(e.adapter==='catbox'){
    const form=new FormData();
    form.append('reqtype','fileupload');
    form.append('fileToUpload',new Blob([payload],{type:'application/octet-stream'}),objectId+'.bin');
    const r=await fetchTimed(u,{method:'POST',body:form},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const remote=String(await r.text()).trim();
    return {remoteUrl:publicUrl(remote,`WRITE_${e.id}_REMOTE`).toString()};
  }
  if(e.adapter==='temp_sh'){
    const form=new FormData();
    form.append('file',new Blob([payload],{type:'application/octet-stream'}),objectId+'.bin');
    const r=await fetchTimed(u,{method:'POST',body:form},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const remote=String(await r.text()).trim();
    return {remoteUrl:publicUrl(remote,`WRITE_${e.id}_REMOTE`).toString()};
  }
  if(e.adapter==='pastebin_ai_b64'){
    const endpoint=fixedApiUrl(u);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({title:objectId,content:b64u(payload),language:'plaintext',visibility:'unlisted',expiration:'1y'})},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    return {remoteUrl:responseRemoteUrl(await r.text(),r.headers,endpoint)};
  }
  if(e.adapter==='dpaste_b64'){
    const current=fixedApiUrl(u),body=new URLSearchParams({content:b64u(payload),expiry_days:'365'});
    let r=await fetchTimed(current,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'MEL-ShardVault/1.0','accept':'text/plain'},body:body.toString()},15000);
    let endpoint=current;
    if(r.status===400||r.status===404||r.status===405){
      endpoint='https://dpaste.com/api/';
      r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'MEL-ShardVault/1.0','accept':'text/plain'},body:body.toString()},15000);
    }
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const page=responseRemoteUrl(await r.text(),r.headers,endpoint);
    return {remoteUrl:page.endsWith('.txt')?page:page.replace(/\/$/,'')+'.txt'};
  }
  if(e.adapter==='pastemyst_b64'){
    const endpoint=fixedApiUrl(u);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:JSON.stringify({title:objectId,expiresIn:'1y',isPrivate:false,isPublic:false,pasties:[{language:'Plain Text',title:'shard.txt',code:b64u(payload)}]})},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),id=String(data?._id||data?.id||'').trim();
    if(!id)throw new Error(`WRITE_${e.id}_REMOTE_ID_MISSING`);
    return {remoteUrl:'https://paste.myst.rs/api/v2/paste/'+encodeURIComponent(id)};
  }
  if(e.adapter==='onec3_b64'){
    const endpoint=fixedApiUrl(u),form=new FormData();
    form.append('content',b64u(payload));
    form.append('expires','31536000');
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:form},30000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    return {remoteUrl:responseRemoteUrl(await r.text(),r.headers,endpoint)};
  }
  if(e.adapter==='msk_paste_b64'){
    const endpoint=fixedApiUrl(u);
    const r=await fetchRateAware(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({content:b64u(payload),title:objectId,language:'plaintext',expiresIn:'1y',burnAfterRead:false})},15000,3);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    return {remoteUrl:responseRemoteUrl(await r.text(),r.headers,endpoint)};
  }
  if(e.adapter==='pastebox_b64'){
    const endpoint=fixedApiUrl(u);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({content:b64u(payload),title:objectId,language:'plaintext',content_type:'memory',expiration:'3M',exposure:'unlisted',source:'agent',agent_name:'MEL-ShardVault'})},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    return {remoteUrl:responseRemoteUrl(await r.text(),r.headers,endpoint)};
  }
  if(e.adapter==='pastehtml_b64'){
    const endpoint=fixedApiUrl(u);
    const body='<pre data-mel-shard="1">'+b64u(payload)+'</pre>';
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'text/html','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),raw=String(data?.raw_url||'').trim();
    if(!raw)throw new Error(`WRITE_${e.id}_REMOTE_URL_MISSING`);
    return {remoteUrl:publicUrl(raw,`WRITE_${e.id}_REMOTE`).toString()};
  }
  if(e.adapter==='pastegg_b64'){
    const endpoint=fixedApiUrl(u);
    const body={name:objectId,visibility:'unlisted',files:[{name:'shard.bin',content:{format:'base64',content:b64(payload)}}]};
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:JSON.stringify(body)},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),id=String(data?.result?.id||data?.id||'').trim();
    if(!id)throw new Error(`WRITE_${e.id}_REMOTE_ID_MISSING`);
    return {remoteUrl:'https://api.paste.gg/v1/pastes/'+encodeURIComponent(id)+'?full=true'};
  }
  if(e.adapter==='markdownpaste_b64'){
    const endpoint=fixedApiUrl(u);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:JSON.stringify({content:b64u(payload),expires_in:0})},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),id=String(data?.id||'').trim();
    if(!id)throw new Error(`WRITE_${e.id}_REMOTE_ID_MISSING`);
    return {remoteUrl:'https://markdownpasteit.vercel.app/api/paste/'+encodeURIComponent(id)};
  }
  if(e.adapter==='udrop_dev_b64'){
    const endpoint=fixedApiUrl(u);
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'text/plain; charset=utf-8','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:b64u(payload)},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),base=String(data?.url||'').trim();
    if(!base)throw new Error(`WRITE_${e.id}_REMOTE_URL_MISSING`);
    return {remoteUrl:publicUrl(base.replace(/\/$/,'')+'/raw',`WRITE_${e.id}_REMOTE`).toString()};
  }
  if(e.adapter==='waifuvault_b64'){
    const endpoint=fixedApiUrl(u),form=new FormData();
    form.append('file',new Blob([b64u(payload)],{type:'text/plain'}),objectId+'.txt');
    const r=await fetchTimed(endpoint,{method:'PUT',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:form},20000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    return {remoteUrl:responseRemoteUrl(await r.text(),r.headers,endpoint)};
  }
  if(e.adapter==='telegraph_b64'){
    const accountEndpoint='https://api.telegra.ph/createAccount';
    const accountBody=new URLSearchParams({
      short_name:('mel'+objectId.replace(/[^a-zA-Z0-9]/g,'')).slice(0,32)||'melshardvault',
      author_name:'MEL ShardVault'
    });
    const accountResp=await fetchTimed(accountEndpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:accountBody.toString()},15000);
    if(!accountResp.ok)throw new Error(`WRITE_${e.id}_ACCOUNT_${accountResp.status}`);
    const account=await accountResp.json().catch(()=>null);
    const token=String(account?.result?.access_token||'').trim();
    if(account?.ok!==true||!token)throw new Error(`WRITE_${e.id}_ACCOUNT_TOKEN_MISSING`);
    const endpoint=fixedApiUrl(u);
    const content=JSON.stringify([{tag:'pre',children:[b64u(payload)]}]);
    const pageBody=new URLSearchParams({
      access_token:token,
      title:objectId,
      author_name:'MEL ShardVault',
      content,
      return_content:'false'
    });
    const r=await fetchTimed(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:pageBody.toString()},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),path=String(data?.result?.path||'').trim();
    if(data?.ok!==true||!path)throw new Error(`WRITE_${e.id}_REMOTE_PATH_MISSING`);
    return {remoteUrl:'https://api.telegra.ph/getPage/'+encodeURIComponent(path)+'?return_content=true'};
  }
  if(e.adapter==='paste_c_net'){
    const endpoint=fixedApiUrl(u);
    const r=await fetchTimed(endpoint,{method:'PUT',headers:{'content-type':'application/octet-stream','accept':'application/json, */*','x-uuid':'1','user-agent':'curl/8.0 MEL-ShardVault/1.0'},body:payload},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    return {remoteUrl:responseRemoteUrl(await r.text(),r.headers,endpoint)};
  }
  if(e.adapter==='fileditch_b64'){
    const encoded=b64u(payload);
    const r=await fetchTimed(u,{method:'PUT',headers:{'content-type':'text/plain; charset=utf-8','accept':'application/json','user-agent':'MEL-ShardVault/1.0'},body:encoded},15000);
    if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
    return {remoteUrl:responseRemoteUrl(await r.text(),r.headers,u)};
  }
  const r=await fetchTimed(u,{method:e.method,headers:{'content-type':'application/octet-stream'},body:payload});
  if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
  return null;
}
async function fetchOnceManual(url,options={},ms=12000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{...options,redirect:'manual',signal:controller.signal});}
  finally{clearTimeout(timer);}
}
async function filebinDownload(url){
  let r=await fetchOnceManual(url,{method:'GET',headers:{'accept':'application/octet-stream'}},12000);
  if(r.status===200&&String(r.headers.get('content-type')||'').toLowerCase().includes('text/html')){
    const cookie=String(r.headers.get('set-cookie')||'').split(';')[0].trim();
    if(cookie)r=await fetchOnceManual(url,{method:'GET',headers:{'accept':'application/octet-stream','cookie':cookie}},12000);
  }
  if([301,302,303,307,308].includes(r.status)){
    const location=r.headers.get('location');
    if(!location)throw new Error('FILEBIN_REDIRECT_LOCATION_MISSING');
    return fetchTimed(publicUrl(new URL(location,url).toString(),'FILEBIN_READ_REDIRECT'),{method:'GET'},12000);
  }
  return r;
}
async function download(env,e,objectId,descriptor=null){
  if(e.backend==='r2'){
    if(!env?.MEDIA_BUCKET?.get)throw new Error('R2_BINDING_UNAVAILABLE');
    const body=await env.MEDIA_BUCKET.get(String(e.keyPrefix||'shardvault/objects/')+objectId);
    if(!body)throw new Error(`READ_${e.id}_404`);
    return new Uint8Array(await body.arrayBuffer());
  }
  if(e.backend==='d1'){
    if(!env?.DB?.prepare)throw new Error('D1_BINDING_UNAVAILABLE');
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS shardvault_objects (object_id TEXT PRIMARY KEY, payload_b64 TEXT NOT NULL, byte_length INTEGER NOT NULL, created_at TEXT NOT NULL)').run();
    const row=await env.DB.prepare('SELECT payload_b64,byte_length FROM shardvault_objects WHERE object_id=? LIMIT 1').bind(objectId).first();
    if(!row?.payload_b64)throw new Error(`READ_${e.id}_404`);
    const payload=unb64u(row.payload_b64);
    if(Number(row.byte_length)!==payload.length)throw new Error(`READ_${e.id}_LENGTH_MISMATCH`);
    return payload;
  }
  const remote=descriptor?.remoteUrl;
  if(e.adapter==='pastemyst_b64'){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'application/json'}},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),code=String(data?.pasties?.[0]?.code||'').trim();
    if(!code)throw new Error(`READ_${e.id}_CONTENT_MISSING`);
    return unb64u(code);
  }
  if(['pastebin_ai_b64','dpaste_b64','onec3_b64','msk_paste_b64','pastebox_b64','fileditch_b64'].includes(e.adapter)){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'text/plain,application/json','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    const text=String(await r.text()).trim();
    if(!text)throw new Error(`READ_${e.id}_CONTENT_MISSING`);
    let encoded=text;
    if(e.adapter==='pastebox_b64'){
      try{const data=JSON.parse(text);encoded=String(data?.content??data?.data?.content??data?.paste?.content??text).trim();}catch{}
    }
    return unb64u(encoded);
  }
  if(e.adapter==='pastehtml_b64'){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'text/plain','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    const text=String(await r.text()).trim();
    const m=/^<pre data-mel-shard="1">([A-Za-z0-9_-]+)<\/pre>$/.exec(text);
    const encoded=String(m?.[1]||'').trim();
    if(!encoded)throw new Error(`READ_${e.id}_PASTEHTML_CONTENT_MISSING`);
    return unb64u(encoded);
  }
  if(e.adapter==='pastegg_b64'){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),content=data?.result?.files?.[0]?.content;
    const encoded=String(content?.content??content?.value??'').trim();
    if(!encoded)throw new Error(`READ_${e.id}_PASTEGG_CONTENT_MISSING`);
    return unb64(encoded);
  }
  if(e.adapter==='markdownpaste_b64'){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null),encoded=String(data?.content||'').trim();
    if(!encoded)throw new Error(`READ_${e.id}_MARKDOWNPASTE_CONTENT_MISSING`);
    return unb64u(encoded);
  }
  if(e.adapter==='udrop_dev_b64'){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'text/plain','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    const encoded=String(await r.text()).trim();
    if(!encoded)throw new Error(`READ_${e.id}_UDROP_CONTENT_MISSING`);
    return unb64u(encoded);
  }
  if(e.adapter==='waifuvault_b64'){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'*/*','user-agent':'Mozilla/5.0 MEL-ShardVault/1.0'}},20000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    const encoded=String(await r.text()).trim();
    if(!encoded)throw new Error(`READ_${e.id}_WAIFUVAULT_CONTENT_MISSING`);
    return unb64u(encoded);
  }
  if(e.adapter==='telegraph_b64'){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'application/json','user-agent':'MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    const data=await r.json().catch(()=>null);
    if(data?.ok!==true)throw new Error(`READ_${e.id}_TELEGRAPH_FAILED`);
    const collect=node=>{
      if(typeof node==='string')return node;
      if(Array.isArray(node))return node.map(collect).join('');
      if(node&&typeof node==='object')return collect(node.children||[]);
      return '';
    };
    const encoded=collect(data?.result?.content).trim();
    if(!encoded)throw new Error(`READ_${e.id}_TELEGRAPH_CONTENT_MISSING`);
    return unb64u(encoded);
  }
  if(['catbox','temp_sh'].includes(e.adapter)){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET'},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  if(e.adapter==='paste_c_net'){
    if(!remote)throw new Error(`READ_${e.id}_REMOTE_URL_MISSING`);
    const r=await fetchTimed(publicUrl(remote,`READ_${e.id}_REMOTE`),{method:'GET',headers:{'accept':'application/octet-stream, */*','user-agent':'curl/8.0 MEL-ShardVault/1.0'}},15000);
    if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  const u=publicUrl(e.urlTemplate.replaceAll('{objectId}',encodeURIComponent(objectId)),`READ_${e.id}`);
  const r=e.adapter==='filebin'?await filebinDownload(u):await fetchTimed(u,{method:'GET'});
  if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
const BASE64_WRAPPED_ADAPTERS=new Set(['pastebin_ai_b64','dpaste_b64','pastemyst_b64','onec3_b64','msk_paste_b64','pastebox_b64','pastehtml_b64','fileditch_b64','pastegg_b64','markdownpaste_b64','udrop_dev_b64','waifuvault_b64','telegraph_b64']);
function fragmentChunkLimit(e){
  const max=Math.max(256,Number(e?.maxBytes)||256);
  if(e?.backend==='r2'||e?.backend==='d1')return max;
  const ratio=BASE64_WRAPPED_ADAPTERS.has(String(e?.adapter||''))?0.70:0.90;
  return Math.max(256,Math.floor(max*ratio));
}
async function uploadFragment(env,e,objectId,payload){
  const data=bytes(payload),limit=fragmentChunkLimit(e);
  if(data.length<=limit){
    const locator=await upload(env,e,objectId,data);
    return {objectId,remoteUrl:locator?.remoteUrl||null,parts:null};
  }
  const parts=[];
  for(let offset=0,index=0;offset<data.length;offset+=limit,index++){
    const chunk=data.slice(offset,Math.min(data.length,offset+limit));
    const partId=objectId+'-p'+String(index).padStart(4,'0');
    const locator=await upload(env,e,partId,chunk);
    parts.push({objectId:partId,remoteUrl:locator?.remoteUrl||null,byteLength:chunk.length});
  }
  return {objectId,remoteUrl:null,parts};
}
async function downloadFragment(env,e,d){
  if(!Array.isArray(d?.parts)||!d.parts.length)return download(env,e,d.objectId,d);
  const out=[];
  for(const part of d.parts){
    const b=await download(env,e,part.objectId,{...d,objectId:part.objectId,remoteUrl:part.remoteUrl||null,parts:null});
    if(Number(part.byteLength)>0&&b.length!==Number(part.byteLength))throw new Error('SHARD_PART_LENGTH_INVALID');
    out.push(b);
  }
  return concat(...out);
}
async function appendManifest(env,c,m){
  if(c.storageMode==='CLOUDFLARE_FALLBACK'||c.storageMode==='EXTERNAL_DISTRIBUTED'){
    const key=r2ManifestPrefix(c)+m.snapshotId+'-r'+String(m.revision||1).padStart(4,'0')+'.json';
    await env.MEDIA_BUCKET.put(key,JSON.stringify(m),{httpMetadata:{contentType:'application/json'}});
    return;
  }
  const r=await fetchTimed(env.MEL_INVENTORY_APPEND_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m)});
  if(!r.ok)throw new Error(`INVENTORY_APPEND_${r.status}`);
}
async function collect(env,c,m){const key=await hkdf(c.master,utf8(m.snapshotId),utf8('MEL-ShardVault/v1/shard-mac')),available=Array(m.totalShards).fill(null),missing=[],errors=[];for(const d of m.shards||[]){try{const e=endpointById(c,d.endpointId,d);if(!e)throw new Error('ENDPOINT_UNKNOWN');const b=await downloadFragment(env,e,d),mac=b64u(await hmac(key,concat(utf8(`${m.snapshotId}:${d.index}:`),b)));if(b.length!==m.shardSize||mac!==d.mac)throw new Error('SHARD_MAC_INVALID');available[d.index]=b;}catch(error){missing.push(d.index);errors.push({index:d.index,message:String(error?.message||error)});}}return {available,missing:[...new Set(missing)],errors};}
async function repair(env,c,m,reconstructed,missing){if(!missing.length)return m;const descriptors=m.shards.map(d=>({...d})),key=await hkdf(c.master,utf8(m.snapshotId),utf8('MEL-ShardVault/v1/shard-mac')),counts=new Map(c.allEndpoints.map(e=>[e.id,0]));for(const d of descriptors)if(!missing.includes(d.index))counts.set(d.endpointId,(counts.get(d.endpointId)||0)+1);for(const index of missing){const prev=descriptors[index],candidates=[...c.allEndpoints].sort((a,b)=>(counts.get(a.id)||0)-(counts.get(b.id)||0)||(a.id===prev?.endpointId?-1:b.id===prev?.endpointId?1:a.id.localeCompare(b.id)));let done=false;for(const e of candidates){const objectId=e.id===prev?.endpointId?prev.objectId:rid(24);try{const locator=await uploadFragment(env,e,objectId,reconstructed[index]);descriptors[index]={index,endpointId:e.id,endpoint:endpointSnapshot(e),objectId:locator.objectId,remoteUrl:locator.remoteUrl||null,parts:locator.parts||null,byteLength:m.shardSize,mac:b64u(await hmac(key,concat(utf8(`${m.snapshotId}:${index}:`),reconstructed[index])))};counts.set(e.id,(counts.get(e.id)||0)+1);done=true;break;}catch{}}if(!done)throw new Error(`REPAIR_FAILED_${index}`);}const next={...m,revision:(m.revision||1)+1,updatedAt:new Date().toISOString(),shards:descriptors};next.manifestMac=await manifestMac(c,next);await appendManifest(env,c,next);return next;}
async function checkAndRepair(env,c,m){const got=await collect(env,c,m),reconstructed=decode(got.available,m.dataShards,m.totalShards,m.shardSize),padded=concat(...reconstructed.slice(0,m.dataShards)),cipher=padded.slice(0,m.ciphertextLength);await decrypt(c.master,m.snapshotId,cipher,unb64u(m.iv));const repaired=got.missing.length?await repair(env,c,m,reconstructed,got.missing):m;return {snapshotId:m.snapshotId,revision:repaired.revision,healthy:true,missing:got.missing,repaired:repaired.revision!==m.revision,errors:got.errors};}
async function publishSnapshot(env,c,payload){const plain=utf8(JSON.stringify(payload)),snapshotId=rid(18),iv=new Uint8Array(12);crypto.getRandomValues(iv);const cipher=await encrypt(c.master,snapshotId,plain,iv),size=Math.max(1,Math.ceil(cipher.length/c.k)),padded=new Uint8Array(size*c.k);padded.set(cipher);const data=Array.from({length:c.k},(_,i)=>padded.slice(i*size,(i+1)*size)),shards=encode(data,c.n),shardKey=await hkdf(c.master,utf8(snapshotId),utf8('MEL-ShardVault/v1/shard-mac')),descriptors=[];for(let i=0;i<shards.length;i++){const e=c.endpoints[i%c.endpoints.length],objectId=rid(24),locator=await uploadFragment(env,e,objectId,shards[i]);descriptors.push({index:i,endpointId:e.id,endpoint:endpointSnapshot(e),objectId:locator.objectId,remoteUrl:locator.remoteUrl||null,parts:locator.parts||null,byteLength:size,mac:b64u(await hmac(shardKey,concat(utf8(`${snapshotId}:${i}:`),shards[i])))});}const manifest={format:'MEL-ShardVault',formatVersion:2,moduleVersion:'0.4.0-chunked',vaultId:c.vaultId,snapshotId,revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),dataShards:c.k,totalShards:c.n,shardSize:size,ciphertextLength:cipher.length,iv:b64u(iv),shards:descriptors,source:{format:payload.format,version:payload.version,exported_at:payload.exported_at,counts:{memories:payload.memories?.length||0,conversations:payload.conversations?.length||0,archive_messages:payload.archive_messages?.length||0}},diversity:diversity(c.endpoints)};manifest.manifestMac=await manifestMac(c,manifest);await appendManifest(env,c,manifest);return manifest;}

function deployedCodeIdentity(env){
  const repository=String(env?.MEL_GITHUB_REPOSITORY||'').trim();
  const sha=typeof MEL_DEPLOYED_GIT_SHA!=='undefined'?String(MEL_DEPLOYED_GIT_SHA||'').trim():'';
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!/^[0-9a-f]{40}$/i.test(sha))return null;
  const stem=repository.replace('/','__')+'/'+sha;
  return {repository,sha,key:'shardvault/code/'+stem+'.tar.gz',criticalKey:'shardvault/code-critical/'+stem+'.tar.gz',manifestKey:'shardvault/code-manifests/'+stem+'.json'};
}
async function inspectCodeArchive(env,c=null){
  const id=deployedCodeIdentity(env);
  if(!id)return {ok:false,status:'IDENTITY_UNAVAILABLE'};
  if(!env?.MEDIA_BUCKET?.head)return {ok:false,status:'R2_UNAVAILABLE',repository:id.repository,sha:id.sha};
  const object=await env.MEDIA_BUCKET.head(id.key);
  if(!object)return {ok:false,status:'MISSING',repository:id.repository,sha:id.sha,bucket:'meliturgos-private-media',key:id.key};
  const critical=await env.MEDIA_BUCKET.head(id.criticalKey).catch(()=>null);
  let external=null;
  if(env?.MEDIA_BUCKET?.get){
    try{
      const body=await env.MEDIA_BUCKET.get(id.manifestKey);
      if(body){
        const manifest=JSON.parse(await body.text());
        let verified=true;
        if(c&&manifest?.manifestMac){
          const copy={...manifest};delete copy.manifestMac;
          const key=await hkdf(c.master,utf8(id.sha),utf8('MEL-ShardVault/v1/code-manifest-mac'));
          verified=b64u(await hmac(key,utf8(stable(copy))))===manifest.manifestMac;
        }
        if(verified&&manifest?.git_sha===id.sha){
          external={
            status:'COPIED',
            manifest_key:id.manifestKey,
            snapshot_id:manifest.snapshotId||null,
            shards:Number(manifest.totalShards)||0,
            data_shards:Number(manifest.dataShards)||0,
            endpoints:[...new Set((manifest.shards||[]).map(x=>x.endpointId).filter(Boolean))],
            created_at:manifest.createdAt||null
          };
        }
      }
    }catch{}
  }
  return {ok:true,status:'COPIED',repository:id.repository,sha:id.sha,bucket:'meliturgos-private-media',key:id.key,bytes:Number(object.size)||null,critical_key:id.criticalKey,critical_bytes:Number(critical?.size)||null,critical_status:critical?'COPIED':'MISSING',external};
}
async function ensureCodeArchive(env){
  const existing=await inspectCodeArchive(env);
  if(existing.ok)return existing;
  const id=deployedCodeIdentity(env);
  if(!id||!env?.MEDIA_BUCKET?.put)return existing;
  const headers={'accept':'application/vnd.github+json','user-agent':'MEL-ShardVault/0.4'};
  const token=String(env?.MEL_GITHUB_TOKEN||env?.GITHUB_TOKEN||'').trim();
  if(token)headers.authorization='Bearer '+token;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  let response;
  try{
    response=await fetch('https://api.github.com/repos/'+id.repository+'/tarball/'+id.sha,{method:'GET',headers,redirect:'follow',signal:controller.signal});
  }finally{clearTimeout(timer);}
  if(!response?.ok)throw new Error('CODE_ARCHIVE_HTTP_'+String(response?.status||0));
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>64*1024*1024)throw new Error('CODE_ARCHIVE_TOO_LARGE');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const sha256=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
  await env.MEDIA_BUCKET.put(id.key,bytes,{httpMetadata:{contentType:'application/gzip'},customMetadata:{repository:id.repository,git_sha:id.sha,sha256}});
  return {ok:true,status:'COPIED',repository:id.repository,sha:id.sha,bucket:'meliturgos-private-media',key:id.key,bytes:bytes.length,sha256};
}
async function ensureExternalCodeArchive(env,c,codeBackup){
  if(!codeBackup?.ok||!env?.MEDIA_BUCKET?.get||!env?.MEDIA_BUCKET?.put)return codeBackup;
  const id=deployedCodeIdentity(env);
  if(!id)return codeBackup;
  const externalEndpoints=(c.endpoints||[]).filter(e=>!e.backend);
  const goal=Math.min(7,c.n);
  if(externalEndpoints.length<goal)return {...codeBackup,external:{status:'WAITING_TARGETS',endpoints:externalEndpoints.map(e=>e.id),target_count:goal}};
  const existing=await inspectCodeArchive(env,c);
  if(existing?.external?.status==='COPIED'&&existing.external.endpoints?.length>=goal)return existing;
  const object=await env.MEDIA_BUCKET.get(id.criticalKey);
  if(!object)return {...codeBackup,external:{status:'CRITICAL_ARCHIVE_MISSING',target_count:goal,critical_key:id.criticalKey}};
  const plain=new Uint8Array(await object.arrayBuffer());
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',plain));
  const archiveSha256=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
  const snapshotId='code-'+id.sha.slice(0,16)+'-'+rid(6),iv=new Uint8Array(12);crypto.getRandomValues(iv);
  const cipher=await encrypt(c.master,snapshotId,plain,iv),size=Math.max(1,Math.ceil(cipher.length/c.k)),padded=new Uint8Array(size*c.k);padded.set(cipher);
  const data=Array.from({length:c.k},(_,i)=>padded.slice(i*size,(i+1)*size)),shards=encode(data,c.n);
  const shardKey=await hkdf(c.master,utf8(snapshotId),utf8('MEL-ShardVault/v1/code-shard-mac')),descriptors=[];
  for(let i=0;i<shards.length;i++){
    const e=externalEndpoints[i%externalEndpoints.length],objectId='code-'+id.sha.slice(0,12)+'-'+String(i).padStart(2,'0')+'-'+rid(6);
    const locator=await uploadFragment(env,e,objectId,shards[i]);
    descriptors.push({index:i,endpointId:e.id,endpoint:endpointSnapshot(e),objectId:locator.objectId,remoteUrl:locator.remoteUrl||null,parts:locator.parts||null,byteLength:size,mac:b64u(await hmac(shardKey,concat(utf8(`${snapshotId}:${i}:`),shards[i])))});
  }
  const manifest={format:'MEL-ShardVault-Code',formatVersion:2,repository:id.repository,git_sha:id.sha,archive_key:id.criticalKey,snapshotId,createdAt:new Date().toISOString(),dataShards:c.k,totalShards:c.n,shardSize:size,ciphertextLength:cipher.length,iv:b64u(iv),archiveBytes:plain.length,sha256:archiveSha256,shards:descriptors,diversity:diversity(externalEndpoints)};
  const unsigned={...manifest},key=await hkdf(c.master,utf8(id.sha),utf8('MEL-ShardVault/v1/code-manifest-mac'));
  manifest.manifestMac=b64u(await hmac(key,utf8(stable(unsigned))));
  await env.MEDIA_BUCKET.put(id.manifestKey,JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}});
  return {...codeBackup,external:{status:'COPIED',manifest_key:id.manifestKey,snapshot_id:snapshotId,shards:c.n,data_shards:c.k,endpoints:[...new Set(descriptors.map(x=>x.endpointId))],created_at:manifest.createdAt}};
}

export async function runShardVaultCycle(env,{force=false,skipExternalCode=false}={}){
  if(String(env?.MEL_SHARDVAULT_ENABLED||'false')!=='true')return {ok:true,enabled:false,skipped:true,reason:'DISABLED'};
  let c;
  try{c=await config(env);}catch(error){return {ok:false,enabled:true,skipped:true,reason:'CONFIG_INVALID',error:String(error?.message||error)};}
  if(!c.ok)return {ok:false,enabled:true,skipped:true,reason:'CONFIG_MISSING',missing:c.missing};
  let codeBackup=null;
  try{codeBackup=await ensureCodeArchive(env);}catch(error){codeBackup={ok:false,status:'COPY_FAILED',error:String(error?.message||error)};}
  try{
    const rows=await inventoryRows(env,c),last=latestSnapshot(rows),age=last?Date.now()-Date.parse(last.createdAt||0):Infinity;
    let health=null,autonomous=null;
    if(last){
      try{health=await checkAndRepair(env,c,last);}
      catch(error){
        health={snapshotId:last.snapshotId,healthy:false,fatal:String(error?.message||error)};
        const enriched=await enrichAutonomous(env,c,last.shardSize||0);c=enriched.config;autonomous=enriched.report;
        if(c.allEndpoints.length){try{health=await checkAndRepair(env,c,last);}catch(error2){health={snapshotId:last.snapshotId,healthy:false,fatal:String(error2?.message||error2)};}}
      }
    }
    if(!force&&last&&Number.isFinite(age)&&age<c.intervalMs)return {ok:health?.healthy!==false,enabled:true,skipped:true,reason:'INTERVAL_NOT_DUE',latest_snapshot:last.snapshotId,age_ms:age,health,autonomous,diversity:diversity(c.endpoints),storage_mode:c.storageMode,degraded:c.degraded,code_backup:codeBackup};
    const payload=await buildShardVaultMemoryPayload(env,{limit:Number(env.MEL_SHARDVAULT_EXPORT_LIMIT)||10000});
    payload.code_survival=codeBackup;
    const estimated=Math.max(256,Math.ceil((utf8(JSON.stringify(payload)).length+16)/c.k)),enriched=await enrichAutonomous(env,c,estimated);
    c=enriched.config;autonomous=enriched.report;
    if(!c.endpoints.length)throw new Error('NO_STORAGE_ENDPOINTS_AVAILABLE');
    if(!skipExternalCode){
      try{codeBackup=await ensureExternalCodeArchive(env,c,codeBackup);}catch(error){codeBackup={...codeBackup,external:{status:'COPY_FAILED',error:String(error?.message||error)}};}
    }
    payload.code_survival=codeBackup;
    const manifest=await publishSnapshot(env,c,payload);
    manifest.autonomousSelection=autonomous?{discovered:autonomous.discovered||0,probed:autonomous.probed||0,selected:autonomous.selected?.length||0,diversity:autonomous.diversity||null,error:autonomous.error||null}:null;
    return {ok:true,enabled:true,skipped:false,snapshot_id:manifest.snapshotId,created_at:manifest.createdAt,shards:manifest.totalShards,data_shards:manifest.dataShards,health_before:health,counts:manifest.source.counts,autonomous:manifest.autonomousSelection,diversity:manifest.diversity,storage_mode:c.storageMode,degraded:c.degraded,external_only:c.endpoints.length>=c.n&&c.endpoints.every(e=>!e.backend),used_endpoint_ids:c.endpoints.map(e=>e.id),code_backup:codeBackup};
  }catch(error){return {ok:false,enabled:true,skipped:false,reason:'CYCLE_FAILED',error:String(error?.message||error),diversity:diversity(c.endpoints),storage_mode:c.storageMode,degraded:c.degraded,code_backup:codeBackup};}
}
export async function syncShardVaultCodeExternally(env){
  if(String(env?.MEL_SHARDVAULT_ENABLED||'false')!=='true')return {ok:true,enabled:false,skipped:true,reason:'DISABLED'};
  let c;
  try{c=await config(env);}catch(error){return {ok:false,status:'CONFIG_INVALID',error:String(error?.message||error)};}
  if(!c.ok)return {ok:false,status:'CONFIG_MISSING',missing:c.missing};
  let codeBackup;
  try{codeBackup=await ensureCodeArchive(env);}catch(error){return {ok:false,status:'CODE_ARCHIVE_FAILED',error:String(error?.message||error)};}
  try{
    const enriched=await enrichAutonomous(env,c,32*1024);
    c=enriched.config;
    const external=(c.endpoints||[]).filter(e=>!e.backend);
    const goal=Math.min(7,c.n);
    if(external.length<goal)return {ok:false,status:'WAITING_TARGETS',selected:external.map(e=>e.id),target_count:goal,code_backup:codeBackup};
    const result=await ensureExternalCodeArchive(env,c,codeBackup);
    return {ok:result?.external?.status==='COPIED',status:result?.external?.status||'UNKNOWN',external:result?.external||null,repository:result?.repository||codeBackup.repository,sha:result?.sha||codeBackup.sha,critical_status:result?.critical_status||codeBackup.critical_status||null};
  }catch(error){
    return {ok:false,status:'COPY_FAILED',error:String(error?.message||error),code_backup:codeBackup};
  }
}

export const __shardvaultTest = Object.freeze({ encode, decode, selectEndpoints, diversity, extendActiveEndpoints, externalEndpointsFromSnapshot });


function publicEndpointView(e){return {id:e.id,backend:e.backend||'http',bucket:e.bucketName||null,key_prefix:e.keyPrefix||null,operatorDomain:e.operatorDomain,providerId:e.providerId,jurisdiction:e.jurisdiction,score:Number(e.score)||0,confidence:Number(e.confidence)||0,autonomous:e.autonomous===true,authMode:e.authMode||null,maxBytes:Number(e.maxBytes)||0,preferred:e.preferred===true,adapter:e.adapter||null,expectedRetentionDays:Number(e.expectedRetentionDays)||0,retentionModel:e.retentionModel||'fixed',baseRetentionDays:Number(e.baseRetentionDays)||Number(e.expectedRetentionDays)||0,refreshEveryDays:Number(e.refreshEveryDays)||0,fullReadRenewsRetention:e.fullReadRenewsRetention===true,evidenceVerification:e.evidenceVerification||null,verifiedAt:e.verifiedAt||null,probeLatencyMs:Number(e.probeLatencyMs)||0};}
const DISCOVERY_STATUS_KEY='shardvault/discovery/latest.json';
const PREFERRED_ENDPOINT_KEY='shardvault/discovery/preferred-endpoint.json';
const ACTIVE_ENDPOINTS_KEY='shardvault/discovery/active-external-endpoints.json';
const VALIDATED_ENDPOINTS_KEY='shardvault/discovery/validated-external-endpoints.json';
async function readPreferredEndpoint(env){
  if(!env?.MEDIA_BUCKET?.get)return null;
  try{
    const body=await env.MEDIA_BUCKET.get(PREFERRED_ENDPOINT_KEY);
    if(!body)return null;
    const parsed=JSON.parse(await body.text());
    return parsed&&typeof parsed.endpoint_id==='string'?parsed:null;
  }catch{return null}
}
async function writePreferredEndpoint(env,endpointId){
  if(!env?.MEDIA_BUCKET?.put)throw new Error('R2_BINDING_UNAVAILABLE');
  const value={endpoint_id:String(endpointId),updated_at:new Date().toISOString()};
  await env.MEDIA_BUCKET.put(PREFERRED_ENDPOINT_KEY,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});
  return value;
}
async function clearPreferredEndpoint(env){
  if(env?.MEDIA_BUCKET?.delete){try{await env.MEDIA_BUCKET.delete(PREFERRED_ENDPOINT_KEY);return true;}catch{}}
  return false;
}
function endpointMeetsDurability(env,e){
  const min=Math.max(1,Number(env?.MEL_AUTONOMOUS_MIN_RETENTION_DAYS)||90);
  if(Number(e?.expectedRetentionDays||0)>=min)return true;
  return e?.retentionModel==='renewable'&&e?.fullReadRenewsRetention===true&&Number(e?.baseRetentionDays||0)>=30&&Number(e?.refreshEveryDays||0)>0&&Number(e?.refreshEveryDays)<Number(e?.baseRetentionDays||0);
}
async function readActiveExternalEndpoints(env){
  if(!env?.MEDIA_BUCKET?.get)return [];
  try{
    const body=await env.MEDIA_BUCKET.get(ACTIVE_ENDPOINTS_KEY);
    if(!body)return [];
    const parsed=JSON.parse(await body.text()),rows=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.endpoints)?parsed.endpoints:[]);
    const out=[];
    for(let i=0;i<rows.length&&out.length<7;i++){
      try{
        const e=normalizeEndpoint(rows[i],i);
        if(endpointMeetsDurability(env,e)&&!out.some(x=>x.id===e.id))out.push(e);
      }catch{}
    }
    return out;
  }catch{return []}
}
async function writeActiveExternalEndpoints(env,endpoints){
  if(!env?.MEDIA_BUCKET?.put)throw new Error('R2_BINDING_UNAVAILABLE');
  const rows=(endpoints||[]).slice(0,7).map(e=>({id:e.id,...endpointSnapshot(e)}));
  await env.MEDIA_BUCKET.put(ACTIVE_ENDPOINTS_KEY,JSON.stringify({version:1,updated_at:new Date().toISOString(),endpoints:rows}),{httpMetadata:{contentType:'application/json'}});
  return endpoints.slice(0,7);
}
async function readValidatedExternalEndpoints(env){
  if(!env?.MEDIA_BUCKET?.get)return [];
  try{
    const body=await env.MEDIA_BUCKET.get(VALIDATED_ENDPOINTS_KEY);
    if(!body)return [];
    const parsed=JSON.parse(await body.text()),rows=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.endpoints)?parsed.endpoints:[]);
    const out=[];
    for(let i=0;i<rows.length&&out.length<25;i++){
      try{
        const e=normalizeEndpoint(rows[i],i);
        if(endpointMeetsDurability(env,e)&&!out.some(x=>x.id===e.id))out.push(e);
      }catch{}
    }
    return out;
  }catch{return []}
}
async function rememberValidatedExternalEndpoints(env,candidates=[]){
  if(!env?.MEDIA_BUCKET?.put)return [];
  const current=await readValidatedExternalEndpoints(env);
  const by=new Map(current.map(e=>[e.id,e]));
  for(const e of candidates||[]){
    if(!e?.id||e?.backend||!endpointMeetsDurability(env,e))continue;
    by.set(e.id,e);
  }
  const rows=[...by.values()].slice(0,25);
  await env.MEDIA_BUCKET.put(VALIDATED_ENDPOINTS_KEY,JSON.stringify({version:1,updated_at:new Date().toISOString(),endpoints:rows.map(e=>({id:e.id,...endpointSnapshot(e)}))}),{httpMetadata:{contentType:'application/json'}});
  return rows;
}
function externalEndpointsFromSnapshot(env,c,last){
  const out=[];
  for(const shard of last?.shards||[]){
    if(out.some(e=>e.id===shard.endpointId))continue;
    const e=endpointById(c,shard.endpointId,shard);
    if(e&&!e.backend&&endpointMeetsDurability(env,e))out.push(e);
  }
  return out.slice(0,Math.min(7,c?.n||7));
}
async function reconcileActiveExternalEndpoints(env,c,last){
  const actual=externalEndpointsFromSnapshot(env,c,last);
  const stored=await readActiveExternalEndpoints(env);
  if(actual.length!==stored.length||actual.some((e,i)=>e.id!==stored[i]?.id))await writeActiveExternalEndpoints(env,actual);
  return actual;
}
async function stageActiveExternalEndpoints(env,c,last,candidates=[]){
  const actual=await reconcileActiveExternalEndpoints(env,c,last);
  const incoming=(candidates||[]).filter(e=>!e?.backend&&endpointMeetsDurability(env,e));
  const maxOp=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_OPERATOR)||2),maxProv=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_PROVIDER)||2);
  const next=extendActiveEndpoints(actual,incoming,Math.min(7,c?.n||7),maxOp,maxProv);
  if(next.length!==actual.length||next.some((e,i)=>e.id!==actual[i]?.id))await writeActiveExternalEndpoints(env,next);
  return next;
}
async function readDiscoveryStatus(env){
  if(!env?.MEDIA_BUCKET?.get)return null;
  try{
    const body=await env.MEDIA_BUCKET.get(DISCOVERY_STATUS_KEY);
    if(!body)return null;
    const parsed=JSON.parse(await body.text());
    return parsed&&typeof parsed==='object'?parsed:null;
  }catch{return null}
}
async function writeDiscoveryStatus(env,result){
  if(!env?.MEDIA_BUCKET?.put)return;
  const safeResult={
    ok:result?.ok===true,
    status:result?.status||null,
    searched_at:result?.searched_at||new Date().toISOString(),
    required_bytes:Number(result?.required_bytes)||0,
    discovered:Number(result?.discovered)||0,
    probed:Number(result?.probed)||0,
    selected:Array.isArray(result?.selected)?result.selected.slice(0,25):[],
    rejected:Array.isArray(result?.rejected)?result.rejected.slice(0,60):[],
    internet_sources:Array.isArray(result?.internet_sources)?result.internet_sources.slice(0,80):[],
    leads:Array.isArray(result?.leads)?result.leads.slice(0,120):[],
    generation:Number(result?.generation)||1,
    known_leads:Number(result?.known_leads)||0,
    new_leads:Number(result?.new_leads)||0,
    query_set:Array.isArray(result?.query_set)?result.query_set.slice(0,10):[],
    diversity:result?.diversity||null,
    target_count:Number(result?.target_count)||7,
    target_reached:result?.target_reached===true,
    continue_searching:result?.continue_searching!==false,
    search_mode:result?.search_mode||'MAINTAIN_7_EXTERNAL',
    error:result?.error||null
  };
  await env.MEDIA_BUCKET.put(DISCOVERY_STATUS_KEY,JSON.stringify(safeResult),{httpMetadata:{contentType:'application/json'}});
}

export async function getShardVaultStatus(env){
  if(String(env?.MEL_SHARDVAULT_ENABLED||'false')!=='true')return {ok:true,enabled:false,status:'DISABLED'};
  let c;
  try{c=await config(env);}catch(error){return {ok:false,enabled:true,status:'CONFIG_INVALID',error:String(error?.message||error)};}
  if(!c.ok)return {ok:false,enabled:true,status:'CONFIG_MISSING',missing:c.missing};
  try{
    const rows=await inventoryRows(env,c),last=latestSnapshot(rows);
    let health=null;
    if(last){
      try{
        const got=await collect(env,c,last);
        const healthy=got.available.filter(Boolean).length;
        health={healthy_shards:healthy,total_shards:last.totalShards,data_shards:last.dataShards,missing:got.missing,recoverable:healthy>=last.dataShards,errors:got.errors};
      }catch(error){health={recoverable:false,error:String(error?.message||error)};}
    }
    const discovery=await readDiscoveryStatus(env);
    let preferred=await readPreferredEndpoint(env);
    const usedCounts={};
    for(const shard of last?.shards||[])usedCounts[shard.endpointId]=(usedCounts[shard.endpointId]||0)+1;
    const actualExternal=await reconcileActiveExternalEndpoints(env,c,last);
    const actualIds=new Set(actualExternal.map(e=>e.id));
    let activeExternal=preferred?(discovery?.selected||[]).find(x=>x.id===preferred.endpoint_id):null;
    if(preferred&&(!activeExternal||!endpointMeetsDurability(env,activeExternal))){await clearPreferredEndpoint(env);preferred=null;activeExternal=null;}
    if(activeExternal&&!actualIds.has(activeExternal.id))activeExternal=null;
    const selectedViews=[];
    if(last?.shards?.length){
      for(const shard of last.shards){
        if(selectedViews.some(x=>x.id===shard.endpointId))continue;
        const endpoint=endpointById(c,shard.endpointId,shard);
        if(endpoint)selectedViews.push(publicEndpointView(endpoint));
      }
    }else{
      selectedViews.push(...c.endpoints.map(publicEndpointView));
    }
    return {
      ok:true,enabled:true,status:last?'ONLINE':'NO_SNAPSHOT',
      scheme:{data_shards:c.k,total_shards:c.n,tolerated_losses:c.n-c.k},
      latest:last?{snapshot_id:last.snapshotId,revision:last.revision||1,created_at:last.createdAt,updated_at:last.updatedAt,shard_size:last.shardSize,source:last.source||null,diversity:last.diversity||null,used_endpoints:usedCounts}:null,
      health,
      configured_endpoints:c.allEndpoints.map(publicEndpointView),
      selected_endpoints:selectedViews.map(x=>({...x,used_fragments:Number(usedCounts[x.id]||0),active:x.active===true||Number(usedCounts[x.id]||0)>0})),
      active_external_endpoint:activeExternal?{...activeExternal,preferred:true,used_fragments:Number(usedCounts[activeExternal.id]||0),active:true}:null,
      storage_mode:c.storageMode,
      degraded:c.degraded,
      recovery_key_source:c.keySource,
      code_survival:await inspectCodeArchive(env,c),
      autonomous_enabled:String(env?.MEL_SHARDVAULT_AUTONOMOUS||'true')==='true',
      autonomous_feeds:parseJson(env?.MEL_AUTONOMOUS_FEEDS_JSON,[]).length,
      autonomous_catalog_entries:parseJson(env?.MEL_AUTONOMOUS_REPOSITORIES_JSON,[]).length,
      internet_discovery_enabled:String(env?.MEL_SHARDVAULT_INTERNET_DISCOVERY||'true')==='true',
      discovery_index:String(env?.MEL_SHARDVAULT_DISCOVERY_INDEX||'https://raw.githubusercontent.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/main/shardvault/discovery-index.json'),
      last_discovery:discovery,
      preferred_endpoint:preferred,
      active_external_registry:actualExternal.map(publicEndpointView),
      checked_at:new Date().toISOString()
    };
  }catch(error){return {ok:false,enabled:true,status:'ERROR',error:String(error?.message||error)};}
}

export async function setPreferredShardVaultEndpoint(env,endpointId){
  const id=String(endpointId||'').trim();
  if(!id)return {ok:false,status:'ENDPOINT_ID_REQUIRED'};
  const last=await readDiscoveryStatus(env);
  const selected=Array.isArray(last?.selected)?last.selected:[];
  const endpoint=selected.find(x=>String(x?.id||'')===id);
  if(!endpoint)return {ok:false,status:'ENDPOINT_NOT_VALIDATED',endpoint_id:id};
  if(!endpointMeetsDurability(env,endpoint))return {ok:false,status:'RETENTION_TOO_SHORT',endpoint_id:id,expected_retention_days:Number(endpoint.expectedRetentionDays)||0};
  const saved=await writePreferredEndpoint(env,id);
  return {ok:true,status:'PREFERRED',preferred_endpoint:saved,endpoint};
}

export async function activateValidatedShardVaultEndpoint(env,endpointId){
  const id=String(endpointId||'').trim();
  if(!id)return {ok:false,status:'ENDPOINT_ID_REQUIRED'};
  const validated=await readValidatedExternalEndpoints(env);
  const endpoint=validated.find(x=>String(x?.id||'')===id);
  if(!endpoint)return {ok:false,status:'ENDPOINT_NOT_VALIDATED',endpoint_id:id};
  if(!endpointMeetsDurability(env,endpoint))return {ok:false,status:'RETENTION_TOO_SHORT',endpoint_id:id,expected_retention_days:Number(endpoint.expectedRetentionDays)||0};
  let c;
  try{c=await config(env);}catch{}
  if(!c?.ok)return {ok:false,status:'ACTIVATION_STATUS_FAILED',endpoint_id:id};
  const rows=await inventoryRows(env,c),latestBefore=latestSnapshot(rows);
  const before=await reconcileActiveExternalEndpoints(env,c,latestBefore);
  if(!before.some(e=>e.id===id)&&before.length>=Math.min(7,c.n))return {ok:false,status:'ACTIVE_EXTERNAL_REGISTRY_FULL',endpoint_id:id,active_endpoint_ids:before.map(e=>e.id),target_count:Math.min(7,c.n)};
  const staged=await stageActiveExternalEndpoints(env,c,latestBefore,[endpoint]);
  await writePreferredEndpoint(env,id);
  const cycle=await runShardVaultCycle(env,{force:true});
  if(!cycle?.ok){
    await writeActiveExternalEndpoints(env,before);
    return {ok:false,status:'ACTIVATION_SNAPSHOT_FAILED',endpoint_id:id,cycle,active_endpoint_ids:before.map(e=>e.id)};
  }
  const rowsAfter=await inventoryRows(env,c),latest=latestSnapshot(rowsAfter);
  const actual=await reconcileActiveExternalEndpoints(env,c,latest);
  const used=(latest?.shards||[]).filter(x=>x.endpointId===id).length;
  if(!used)return {ok:false,status:'ACTIVATION_NOT_USED',endpoint_id:id,cycle,active_endpoint_ids:actual.map(e=>e.id)};
  let code_sync=null;
  if(actual.length>=Math.min(7,c.n)){
    try{code_sync=await syncShardVaultCodeExternally(env);}catch(error){code_sync={ok:false,status:'COPY_FAILED',error:String(error?.message||error)};}
  }
  return {ok:true,status:'ACTIVATED',endpoint_id:id,used_fragments:used,snapshot_id:latest.snapshotId,active_external_count:actual.length,active_endpoint_ids:actual.map(e=>e.id),staged_endpoint_ids:staged.map(e=>e.id),code_sync,cycle};
}

export async function searchAutonomousShardVaultRepositories(env){
  let c;
  try{c=await config(env);}catch(error){
    const result={ok:false,error:String(error?.message||error),status:'CONFIG_INVALID',searched_at:new Date().toISOString()};
    await writeDiscoveryStatus(env,result);return result;
  }
  if(!c.ok){
    const result={ok:false,status:'CONFIG_MISSING',missing:c.missing,searched_at:new Date().toISOString()};
    await writeDiscoveryStatus(env,result);return result;
  }
  try{
    let requiredBytes=256,last=null;
    try{const rows=await inventoryRows(env,c);last=latestSnapshot(rows);requiredBytes=Math.max(256,Number(last?.shardSize)||256);}catch{}
    const active=await reconcileActiveExternalEndpoints(env,c,last);
    const report=await discoverAutonomousRepositories(env,{masterKey:c.master,vaultId:c.vaultId,requiredBytes,selectionCount:c.n});
    await rememberValidatedExternalEndpoints(env,report.selected||[]);
    const activeIds=new Set(active.map(e=>e.id));
    let preferred=await readPreferredEndpoint(env);
    const selectedViews=[
      ...active.map(e=>({...publicEndpointView(e),active_registry:true})),
      ...(report.selected||[]).filter(e=>!activeIds.has(e.id)).map(publicEndpointView)
    ];
    if(preferred&&!selectedViews.some(x=>x.id===preferred.endpoint_id&&endpointMeetsDurability(env,x))){
      await clearPreferredEndpoint(env);
      preferred=null;
    }
    const result={
      ok:true,
      searched_at:new Date().toISOString(),
      required_bytes:requiredBytes,
      discovered:report.discovered||0,
      probed:report.probed||0,
      selected:selectedViews,
      preferred_endpoint:preferred,
      rejected:report.rejected||[],
      internet_sources:report.internet_sources||[],
      leads:report.leads||[],
      generation:report.generation||1,
      known_leads:report.known_leads||0,
      new_leads:report.new_leads||0,
      query_set:report.query_set||[],
      diversity:report.diversity||null,
      external_found:active.length>0,
      active_external_count:active.length,
      active_endpoint_ids:active.map(e=>e.id),
      target_count:Math.min(7,c.n),
      target_reached:active.length>=Math.min(7,c.n),
      continue_searching:active.length<Math.min(7,c.n),
      search_mode:'MAINTAIN_7_EXTERNAL'
    };
    await writeDiscoveryStatus(env,result);
    return result;
  }catch(error){
    const result={ok:false,status:'SEARCH_FAILED',error:String(error?.message||error),searched_at:new Date().toISOString()};
    await writeDiscoveryStatus(env,result);
    return result;
  }
}