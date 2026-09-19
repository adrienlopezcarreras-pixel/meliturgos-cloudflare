import { buildShardVaultMemoryPayload } from './shardvault-memory-export.js';
import { discoverAutonomousRepositories } from './autonomous-repositories.js';

const te = new TextEncoder();
const HOUR = 60 * 60 * 1000;

function bytes(v){ if(v instanceof Uint8Array)return new Uint8Array(v); if(v instanceof ArrayBuffer)return new Uint8Array(v); if(ArrayBuffer.isView(v))return new Uint8Array(v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)); throw new TypeError('BYTES_REQUIRED'); }
function utf8(v){ return te.encode(String(v)); }
function concat(...parts){ const a=parts.map(bytes),n=a.reduce((s,x)=>s+x.length,0),out=new Uint8Array(n);let o=0;for(const x of a){out.set(x,o);o+=x.length;}return out; }
function b64u(v){ let s='';const a=bytes(v);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function unb64u(v){ const n=String(v||'').replaceAll('-','+').replaceAll('_','/');const s=atob(n+'='.repeat((4-n.length%4)%4));return Uint8Array.from(s,c=>c.charCodeAt(0)); }
function rid(n=18){ const a=new Uint8Array(n);crypto.getRandomValues(a);return b64u(a); }
function stable(v){ if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stable).join(',')}]`;return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`; }
function parseJson(v,fallback){ try{return JSON.parse(v??JSON.stringify(fallback));}catch{return fallback;} }
function isPrivate4(h){ const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);if(!m)return false;const o=m.slice(1).map(Number);return o.some(x=>x>255)||o[0]===10||o[0]===127||o[0]===0||(o[0]===169&&o[1]===254)||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168); }
function publicUrl(value,label,template=false){ let u;try{u=new URL(template?String(value).replaceAll('{objectId}','probe'):String(value));}catch{throw new Error(`${label}_INVALID`)}const h=u.hostname.toLowerCase();if(u.protocol!=='https:')throw new Error(`${label}_HTTPS_REQUIRED`);if(u.username||u.password)throw new Error(`${label}_CREDENTIALS_FORBIDDEN`);if(h==='localhost'||h.endsWith('.local')||isPrivate4(h)||(h.includes(':')&&(h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80'))))throw new Error(`${label}_PRIVATE_NETWORK_FORBIDDEN`);return u; }
async function fetchTimed(url,options={},ms=12000){ const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,redirect:'error',signal:c.signal});}finally{clearTimeout(t);} }
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

function normalizeEndpoint(e,i){ if(!e?.id||!String(e.urlTemplate||'').includes('{objectId}'))throw new Error(`ENDPOINT_${i}_INVALID`);const probe=publicUrl(e.urlTemplate,`ENDPOINT_${e.id}`,true),method=String(e.method||'PUT').toUpperCase();if(!['PUT','POST'].includes(method))throw new Error(`ENDPOINT_${e.id}_METHOD`);return {id:String(e.id),urlTemplate:String(e.urlTemplate),method,maxBytes:Number(e.maxBytes)||8*1024*1024,operatorDomain:String(e.operatorDomain||probe.hostname).toLowerCase(),providerId:String(e.providerId||e.operatorDomain||probe.hostname).toLowerCase(),jurisdiction:String(e.jurisdiction||'UNKNOWN').toUpperCase(),score:Number.isFinite(Number(e.score))?Number(e.score):0,confidence:Number.isFinite(Number(e.confidence))?Number(e.confidence):0}; }
function selectEndpoints(endpoints,count,maxPerOperator=2,maxPerProvider=2){const ranked=[...endpoints].sort((a,b)=>b.score-a.score||b.confidence-a.confidence||a.id.localeCompare(b.id)),selected=[],ids=new Set(),op=new Map(),prov=new Map();const can=(e,uo=false,up=false)=>!ids.has(e.id)&&(op.get(e.operatorDomain)||0)<maxPerOperator&&(prov.get(e.providerId)||0)<maxPerProvider&&(!uo||(op.get(e.operatorDomain)||0)===0)&&(!up||(prov.get(e.providerId)||0)===0);const add=e=>{selected.push(e);ids.add(e.id);op.set(e.operatorDomain,(op.get(e.operatorDomain)||0)+1);prov.set(e.providerId,(prov.get(e.providerId)||0)+1);};for(const e of ranked){if(can(e,true,true))add(e);if(selected.length>=count)return selected;}for(const e of ranked){if(can(e,true,false))add(e);if(selected.length>=count)return selected;}for(const e of ranked){if(can(e,false,false))add(e);if(selected.length>=count)break;}return selected;}
function diversity(endpoints){return {selected:endpoints.length,uniqueOperators:new Set(endpoints.map(e=>e.operatorDomain)).size,uniqueProviders:new Set(endpoints.map(e=>e.providerId)).size,uniqueJurisdictions:new Set(endpoints.map(e=>e.jurisdiction).filter(x=>x&&x!=='UNKNOWN')).size,fallbackUsed:new Set(endpoints.map(e=>e.operatorDomain)).size<endpoints.length};}
function endpointSnapshot(e){return {backend:e.backend||'http',urlTemplate:e.urlTemplate||null,keyPrefix:e.keyPrefix||null,bucketName:e.bucketName||null,method:e.method||'PUT',maxBytes:e.maxBytes,operatorDomain:e.operatorDomain,providerId:e.providerId,jurisdiction:e.jurisdiction,score:e.score,confidence:e.confidence,autonomous:e.autonomous===true,authMode:e.authMode||null};}
function mergeAutonomous(c,report,env){if(!report?.selected?.length)return c;const by=new Map(c.allEndpoints.map(e=>[e.id,e]));for(const e of report.selected)by.set(e.id,e);const all=[...by.values()],maxOp=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_OPERATOR)||2),maxProv=Math.max(1,Number(env?.MEL_WATCH_MAX_PER_PROVIDER)||2);return {...c,allEndpoints:all,endpoints:selectEndpoints(all,Math.min(c.n,all.length),maxOp,maxProv)};}
async function enrichAutonomous(env,c,requiredBytes){
  if(String(env?.MEL_SHARDVAULT_AUTONOMOUS||'true')!=='true')return {config:c,report:null};
  try{
    const report=await discoverAutonomousRepositories(env,{masterKey:c.master,vaultId:c.vaultId,requiredBytes,selectionCount:c.n});
    const preferred=await readPreferredEndpoint(env);
    if(preferred?.endpoint_id&&Array.isArray(report?.selected)){
      report.selected=report.selected.map(e=>String(e?.id||'')===preferred.endpoint_id?{...e,score:(Number(e.score)||0)+100000,preferred:true}:e);
    }
    return {config:mergeAutonomous(c,report,env),report};
  }catch(error){return {config:c,report:{error:String(error?.message||error),selected:[],rejected:[]}};}
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
  if(c.storageMode==='CLOUDFLARE_FALLBACK'){
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
    return;
  }
  const u=publicUrl(e.urlTemplate.replaceAll('{objectId}',encodeURIComponent(objectId)),`WRITE_${e.id}`),r=await fetchTimed(u,{method:e.method,headers:{'content-type':'application/octet-stream'},body:payload});
  if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`);
}
async function download(env,e,objectId){
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
  const u=publicUrl(e.urlTemplate.replaceAll('{objectId}',encodeURIComponent(objectId)),`READ_${e.id}`),r=await fetchTimed(u,{method:'GET'});
  if(!r.ok)throw new Error(`READ_${e.id}_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function appendManifest(env,c,m){
  if(c.storageMode==='CLOUDFLARE_FALLBACK'){
    const key=r2ManifestPrefix(c)+m.snapshotId+'-r'+String(m.revision||1).padStart(4,'0')+'.json';
    await env.MEDIA_BUCKET.put(key,JSON.stringify(m),{httpMetadata:{contentType:'application/json'}});
    return;
  }
  const r=await fetchTimed(env.MEL_INVENTORY_APPEND_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m)});
  if(!r.ok)throw new Error(`INVENTORY_APPEND_${r.status}`);
}
async function collect(env,c,m){const key=await hkdf(c.master,utf8(m.snapshotId),utf8('MEL-ShardVault/v1/shard-mac')),available=Array(m.totalShards).fill(null),missing=[],errors=[];for(const d of m.shards||[]){try{const e=endpointById(c,d.endpointId,d);if(!e)throw new Error('ENDPOINT_UNKNOWN');const b=await download(env,e,d.objectId),mac=b64u(await hmac(key,concat(utf8(`${m.snapshotId}:${d.index}:`),b)));if(b.length!==m.shardSize||mac!==d.mac)throw new Error('SHARD_MAC_INVALID');available[d.index]=b;}catch(error){missing.push(d.index);errors.push({index:d.index,message:String(error?.message||error)});}}return {available,missing:[...new Set(missing)],errors};}
async function repair(env,c,m,reconstructed,missing){if(!missing.length)return m;const descriptors=m.shards.map(d=>({...d})),key=await hkdf(c.master,utf8(m.snapshotId),utf8('MEL-ShardVault/v1/shard-mac')),counts=new Map(c.allEndpoints.map(e=>[e.id,0]));for(const d of descriptors)if(!missing.includes(d.index))counts.set(d.endpointId,(counts.get(d.endpointId)||0)+1);for(const index of missing){const prev=descriptors[index],candidates=[...c.allEndpoints].sort((a,b)=>(counts.get(a.id)||0)-(counts.get(b.id)||0)||(a.id===prev?.endpointId?-1:b.id===prev?.endpointId?1:a.id.localeCompare(b.id)));let done=false;for(const e of candidates){const objectId=e.id===prev?.endpointId?prev.objectId:rid(24);try{await upload(env,e,objectId,reconstructed[index]);descriptors[index]={index,endpointId:e.id,endpoint:endpointSnapshot(e),objectId,byteLength:m.shardSize,mac:b64u(await hmac(key,concat(utf8(`${m.snapshotId}:${index}:`),reconstructed[index])))};counts.set(e.id,(counts.get(e.id)||0)+1);done=true;break;}catch{}}if(!done)throw new Error(`REPAIR_FAILED_${index}`);}const next={...m,revision:(m.revision||1)+1,updatedAt:new Date().toISOString(),shards:descriptors};next.manifestMac=await manifestMac(c,next);await appendManifest(env,c,next);return next;}
async function checkAndRepair(env,c,m){const got=await collect(env,c,m),reconstructed=decode(got.available,m.dataShards,m.totalShards,m.shardSize),padded=concat(...reconstructed.slice(0,m.dataShards)),cipher=padded.slice(0,m.ciphertextLength);await decrypt(c.master,m.snapshotId,cipher,unb64u(m.iv));const repaired=got.missing.length?await repair(env,c,m,reconstructed,got.missing):m;return {snapshotId:m.snapshotId,revision:repaired.revision,healthy:true,missing:got.missing,repaired:repaired.revision!==m.revision,errors:got.errors};}
async function publishSnapshot(env,c,payload){const plain=utf8(JSON.stringify(payload)),snapshotId=rid(18),iv=new Uint8Array(12);crypto.getRandomValues(iv);const cipher=await encrypt(c.master,snapshotId,plain,iv),size=Math.max(1,Math.ceil(cipher.length/c.k)),padded=new Uint8Array(size*c.k);padded.set(cipher);const data=Array.from({length:c.k},(_,i)=>padded.slice(i*size,(i+1)*size)),shards=encode(data,c.n),shardKey=await hkdf(c.master,utf8(snapshotId),utf8('MEL-ShardVault/v1/shard-mac')),descriptors=[];for(let i=0;i<shards.length;i++){const e=c.endpoints[i%c.endpoints.length],objectId=rid(24);await upload(env,e,objectId,shards[i]);descriptors.push({index:i,endpointId:e.id,endpoint:endpointSnapshot(e),objectId,byteLength:size,mac:b64u(await hmac(shardKey,concat(utf8(`${snapshotId}:${i}:`),shards[i])))});}const manifest={format:'MEL-ShardVault',formatVersion:1,moduleVersion:'0.2.1-integrated',vaultId:c.vaultId,snapshotId,revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),dataShards:c.k,totalShards:c.n,shardSize:size,ciphertextLength:cipher.length,iv:b64u(iv),shards:descriptors,source:{format:payload.format,version:payload.version,exported_at:payload.exported_at,counts:{memories:payload.memories?.length||0,conversations:payload.conversations?.length||0,archive_messages:payload.archive_messages?.length||0}},diversity:diversity(c.endpoints)};manifest.manifestMac=await manifestMac(c,manifest);await appendManifest(env,c,manifest);return manifest;}

function deployedCodeIdentity(env){
  const repository=String(env?.MEL_GITHUB_REPOSITORY||'').trim();
  const sha=typeof MEL_DEPLOYED_GIT_SHA!=='undefined'?String(MEL_DEPLOYED_GIT_SHA||'').trim():'';
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!/^[0-9a-f]{40}$/i.test(sha))return null;
  return {repository,sha,key:'shardvault/code/'+repository.replace('/','__')+'/'+sha+'.tar.gz'};
}
async function inspectCodeArchive(env){
  const id=deployedCodeIdentity(env);
  if(!id)return {ok:false,status:'IDENTITY_UNAVAILABLE'};
  if(!env?.MEDIA_BUCKET?.head)return {ok:false,status:'R2_UNAVAILABLE',repository:id.repository,sha:id.sha};
  const object=await env.MEDIA_BUCKET.head(id.key);
  return object?{ok:true,status:'COPIED',repository:id.repository,sha:id.sha,bucket:'meliturgos-private-media',key:id.key,bytes:Number(object.size)||null}:{ok:false,status:'MISSING',repository:id.repository,sha:id.sha,bucket:'meliturgos-private-media',key:id.key};
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

export async function runShardVaultCycle(env,{force=false}={}){
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
    const manifest=await publishSnapshot(env,c,payload);
    manifest.autonomousSelection=autonomous?{discovered:autonomous.discovered||0,probed:autonomous.probed||0,selected:autonomous.selected?.length||0,diversity:autonomous.diversity||null,error:autonomous.error||null}:null;
    return {ok:true,enabled:true,skipped:false,snapshot_id:manifest.snapshotId,created_at:manifest.createdAt,shards:manifest.totalShards,data_shards:manifest.dataShards,health_before:health,counts:manifest.source.counts,autonomous:manifest.autonomousSelection,diversity:manifest.diversity,storage_mode:c.storageMode,degraded:c.degraded,code_backup:codeBackup};
  }catch(error){return {ok:false,enabled:true,skipped:false,reason:'CYCLE_FAILED',error:String(error?.message||error),diversity:diversity(c.endpoints),storage_mode:c.storageMode,degraded:c.degraded,code_backup:codeBackup};}
}
export const __shardvaultTest = Object.freeze({ encode, decode, selectEndpoints, diversity });


function publicEndpointView(e){return {id:e.id,backend:e.backend||'http',bucket:e.bucketName||null,key_prefix:e.keyPrefix||null,operatorDomain:e.operatorDomain,providerId:e.providerId,jurisdiction:e.jurisdiction,score:Number(e.score)||0,confidence:Number(e.confidence)||0,autonomous:e.autonomous===true,authMode:e.authMode||null,maxBytes:Number(e.maxBytes)||0,preferred:e.preferred===true};}
const DISCOVERY_STATUS_KEY='shardvault/discovery/latest.json';
const PREFERRED_ENDPOINT_KEY='shardvault/discovery/preferred-endpoint.json';
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
    return {
      ok:true,enabled:true,status:last?'ONLINE':'NO_SNAPSHOT',
      scheme:{data_shards:c.k,total_shards:c.n,tolerated_losses:c.n-c.k},
      latest:last?{snapshot_id:last.snapshotId,revision:last.revision||1,created_at:last.createdAt,updated_at:last.updatedAt,shard_size:last.shardSize,source:last.source||null,diversity:last.diversity||null}:null,
      health,
      configured_endpoints:c.allEndpoints.map(publicEndpointView),
      selected_endpoints:c.endpoints.map(publicEndpointView),
      storage_mode:c.storageMode,
      degraded:c.degraded,
      recovery_key_source:c.keySource,
      code_survival:await inspectCodeArchive(env),
      autonomous_enabled:String(env?.MEL_SHARDVAULT_AUTONOMOUS||'true')==='true',
      autonomous_feeds:parseJson(env?.MEL_AUTONOMOUS_FEEDS_JSON,[]).length,
      autonomous_catalog_entries:parseJson(env?.MEL_AUTONOMOUS_REPOSITORIES_JSON,[]).length,
      internet_discovery_enabled:String(env?.MEL_SHARDVAULT_INTERNET_DISCOVERY||'true')==='true',
      discovery_index:String(env?.MEL_SHARDVAULT_DISCOVERY_INDEX||'https://raw.githubusercontent.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/main/shardvault/discovery-index.json'),
      last_discovery:await readDiscoveryStatus(env),
      preferred_endpoint:await readPreferredEndpoint(env),
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
  const saved=await writePreferredEndpoint(env,id);
  return {ok:true,status:'PREFERRED',preferred_endpoint:saved,endpoint};
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
    let requiredBytes=256;
    try{const rows=await inventoryRows(env,c),last=latestSnapshot(rows);requiredBytes=Math.max(256,Number(last?.shardSize)||256);}catch{}
    const report=await discoverAutonomousRepositories(env,{masterKey:c.master,vaultId:c.vaultId,requiredBytes,selectionCount:c.n});
    const result={
      ok:true,
      searched_at:new Date().toISOString(),
      required_bytes:requiredBytes,
      discovered:report.discovered||0,
      probed:report.probed||0,
      selected:(report.selected||[]).map(publicEndpointView),
      rejected:report.rejected||[],
      internet_sources:report.internet_sources||[],
      leads:report.leads||[],
      generation:report.generation||1,
      known_leads:report.known_leads||0,
      new_leads:report.new_leads||0,
      query_set:report.query_set||[],
      diversity:report.diversity||null
    };
    await writeDiscoveryStatus(env,result);
    return result;
  }catch(error){
    const result={ok:false,status:'SEARCH_FAILED',error:String(error?.message||error),searched_at:new Date().toISOString()};
    await writeDiscoveryStatus(env,result);
    return result;
  }
}