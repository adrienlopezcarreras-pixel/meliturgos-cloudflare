import { buildMemoryExportPayload } from '../persistence/memory-backup.js';

const te = new TextEncoder();
const DAY = 24 * 60 * 60 * 1000;

function bytes(v){ if(v instanceof Uint8Array)return new Uint8Array(v); if(v instanceof ArrayBuffer)return new Uint8Array(v); if(ArrayBuffer.isView(v))return new Uint8Array(v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)); throw new TypeError('BYTES_REQUIRED'); }
function utf8(v){ return te.encode(String(v)); }
function b64u(v){ let s=''; const a=bytes(v); for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000)); return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function unb64u(v){ const n=String(v||'').replaceAll('-','+').replaceAll('_','/'); const s=atob(n+'='.repeat((4-n.length%4)%4)); return Uint8Array.from(s,c=>c.charCodeAt(0)); }
function rid(n=18){ const a=new Uint8Array(n); crypto.getRandomValues(a); return b64u(a); }
function stable(v){ if(v===null||typeof v!=='object')return JSON.stringify(v); if(Array.isArray(v))return `[${v.map(stable).join(',')}]`; return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`; }
function isPrivate4(h){ const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h); if(!m)return false; const o=m.slice(1).map(Number); return o.some(x=>x>255)||o[0]===10||o[0]===127||o[0]===0||(o[0]===169&&o[1]===254)||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168); }
function publicUrl(value,label,template=false){ let u; try{u=new URL(template?String(value).replaceAll('{objectId}','probe'):String(value));}catch{throw new Error(`${label}_INVALID`)} const h=u.hostname.toLowerCase(); if(u.protocol!=='https:')throw new Error(`${label}_HTTPS_REQUIRED`); if(u.username||u.password)throw new Error(`${label}_CREDENTIALS_FORBIDDEN`); if(h==='localhost'||h.endsWith('.local')||isPrivate4(h)||(h.includes(':')&&(h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80'))))throw new Error(`${label}_PRIVATE_NETWORK_FORBIDDEN`); return u; }
function parseJson(v,fallback){ try{return JSON.parse(v??JSON.stringify(fallback));}catch{return fallback;} }
async function hkdf(master,salt,info,len=32){ const k=await crypto.subtle.importKey('raw',bytes(master),'HKDF',false,['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:bytes(salt),info:bytes(info)},k,len*8)); }
async function hmac(key,payload){ const k=await crypto.subtle.importKey('raw',bytes(key),{name:'HMAC',hash:'SHA-256'},false,['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(payload))); }
async function encrypt(master,snapshotId,plain,iv){ const raw=await hkdf(master,utf8(snapshotId),utf8('MEL-ShardVault/v1/aes-gcm')); const k=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']); return new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8(snapshotId)},k,plain)); }

const EXP=new Uint8Array(512), LOG=new Uint16Array(256); {let v=1; for(let i=0;i<255;i++){EXP[i]=v;LOG[v]=i;v<<=1;if(v&0x100)v^=0x11d;} for(let i=255;i<512;i++)EXP[i]=EXP[i-255];}
function mul(a,b){ return !a||!b?0:EXP[LOG[a]+LOG[b]]; }
function inv(a){ if(!a)throw new Error('GF_ZERO'); return EXP[255-LOG[a]]; }
function pow(a,e){ if(!e)return 1; if(!a)return 0; return EXP[(LOG[a]*e)%255]; }
function invert(input){ const n=input.length,a=input.map((r,ri)=>[...r,...Array.from({length:n},(_,ci)=>ri===ci?1:0)]); for(let c=0;c<n;c++){let p=c;while(p<n&&!a[p][c])p++;if(p===n)throw new Error('RS_SINGULAR');if(p!==c)[a[p],a[c]]=[a[c],a[p]];const ip=inv(a[c][c]);for(let i=0;i<n*2;i++)a[c][i]=mul(a[c][i],ip);for(let r=0;r<n;r++){if(r===c)continue;const f=a[r][c];if(!f)continue;for(let i=0;i<n*2;i++)a[r][i]^=mul(f,a[c][i]);}} return a.map(r=>r.slice(n)); }
function generator(k,n){ if(!Number.isInteger(k)||!Number.isInteger(n)||k<1||n<=k||n>255)throw new Error('RS_PARAMS_INVALID'); const v=Array.from({length:n},(_,r)=>Array.from({length:k},(_,c)=>pow(r+1,c))); const top=invert(v.slice(0,k)); return v.map(r=>Array.from({length:k},(_,c)=>r.reduce((s,x,i)=>s^mul(x,top[i][c]),0))); }
function encode(data,n){ const k=data.length,size=data[0]?.length||0;if(!k||!size)throw new Error('RS_DATA_EMPTY');const g=generator(k,n),out=data.map(x=>new Uint8Array(x));for(let r=k;r<n;r++){const p=new Uint8Array(size);for(let s=0;s<k;s++){const c=g[r][s];if(!c)continue;for(let i=0;i<size;i++)p[i]^=mul(c,data[s][i]);}out.push(p);}return out; }

function config(env){
  const missing=[]; for(const k of ['MEL_RECOVERY_KEY','MEL_INVENTORY_APPEND_URL','MEL_INVENTORY_LIST_URL']) if(!env?.[k])missing.push(k);
  const endpoints=parseJson(env?.MEL_PUBLIC_ENDPOINTS_JSON,[]);
  if(!Array.isArray(endpoints)||!endpoints.length)missing.push('MEL_PUBLIC_ENDPOINTS_JSON');
  if(missing.length)return {ok:false,missing};
  const master=unb64u(env.MEL_RECOVERY_KEY); if(master.length<32)return {ok:false,missing:['MEL_RECOVERY_KEY(>=32 bytes base64url)']};
  const normalized=endpoints.map((e,i)=>{ if(!e?.id||!String(e.urlTemplate||'').includes('{objectId}'))throw new Error(`ENDPOINT_${i}_INVALID`); publicUrl(e.urlTemplate,`ENDPOINT_${e.id}`,true); const method=String(e.method||'PUT').toUpperCase(); if(!['PUT','POST'].includes(method))throw new Error(`ENDPOINT_${e.id}_METHOD`); return {id:String(e.id),urlTemplate:String(e.urlTemplate),method,maxBytes:Number(e.maxBytes)||8*1024*1024}; });
  publicUrl(env.MEL_INVENTORY_APPEND_URL,'INVENTORY_APPEND'); publicUrl(env.MEL_INVENTORY_LIST_URL,'INVENTORY_LIST');
  return {ok:true,master,endpoints:normalized,vaultId:String(env.MEL_VAULT_ID||'mel-primary'),k:Math.max(2,Number(env.MEL_DATA_SHARDS)||4),n:Math.max(3,Number(env.MEL_TOTAL_SHARDS)||7),intervalMs:Math.max(60*60*1000,Number(env.MEL_SHARDVAULT_INTERVAL_HOURS||24)*60*60*1000)};
}
async function fetchTimed(url,options={},ms=12000){ const c=new AbortController(),t=setTimeout(()=>c.abort(),ms); try{return await fetch(url,{...options,redirect:'error',signal:c.signal});}finally{clearTimeout(t);} }
async function inventoryList(env,c){ const r=await fetchTimed(env.MEL_INVENTORY_LIST_URL,{method:'GET'}); if(!r.ok)throw new Error(`INVENTORY_LIST_${r.status}`); const x=await r.json(); const rows=Array.isArray(x)?x:x?.items; return (Array.isArray(rows)?rows:[]).filter(m=>m?.vaultId===c.vaultId&&m?.format==='MEL-ShardVault'); }
function latest(rows){ return [...rows].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null; }
async function verifyLatest(c,m){ if(!m?.shards?.length)return {checked:0,healthy:0}; const key=await hkdf(c.master,utf8(m.snapshotId),utf8('MEL-ShardVault/v1/shard-mac')); let checked=0,healthy=0; for(const d of m.shards.slice(0,Math.min(m.shards.length,7))){ const e=c.endpoints.find(x=>x.id===d.endpointId); if(!e)continue; checked++; try{const u=publicUrl(e.urlTemplate.replaceAll('{objectId}',encodeURIComponent(d.objectId)),`READ_${e.id}`);const r=await fetchTimed(u,{method:'GET'});if(!r.ok)continue;const b=new Uint8Array(await r.arrayBuffer());const mac=b64u(await hmac(key,new Uint8Array([...utf8(`${m.snapshotId}:${d.index}:`),...b])));if(mac===d.mac)healthy++;}catch{}} return {checked,healthy}; }
async function publishSnapshot(env,c,payload){
  const plain=utf8(JSON.stringify(payload)); const snapshotId=rid(18),iv=new Uint8Array(12);crypto.getRandomValues(iv); const cipher=await encrypt(c.master,snapshotId,plain,iv); const size=Math.max(1,Math.ceil(cipher.length/c.k)); const padded=new Uint8Array(size*c.k);padded.set(cipher); const data=Array.from({length:c.k},(_,i)=>padded.slice(i*size,(i+1)*size)); const shards=encode(data,c.n); const shardKey=await hkdf(c.master,utf8(snapshotId),utf8('MEL-ShardVault/v1/shard-mac')); const descriptors=[];
  for(let i=0;i<shards.length;i++){const e=c.endpoints[i%c.endpoints.length]; if(shards[i].length>e.maxBytes)throw new Error(`ENDPOINT_${e.id}_MAX_BYTES`); const objectId=rid(24),u=publicUrl(e.urlTemplate.replaceAll('{objectId}',encodeURIComponent(objectId)),`WRITE_${e.id}`); const r=await fetchTimed(u,{method:e.method,headers:{'content-type':'application/octet-stream'},body:shards[i]}); if(!r.ok)throw new Error(`WRITE_${e.id}_${r.status}`); const prefix=utf8(`${snapshotId}:${i}:`),mac=b64u(await hmac(shardKey,new Uint8Array([...prefix,...shards[i]]))); descriptors.push({index:i,endpointId:e.id,objectId,byteLength:size,mac}); }
  const manifest={format:'MEL-ShardVault',formatVersion:1,moduleVersion:'0.2.0-integrated',vaultId:c.vaultId,snapshotId,revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),dataShards:c.k,totalShards:c.n,shardSize:size,ciphertextLength:cipher.length,iv:b64u(iv),shards:descriptors,source:{format:payload.format,version:payload.version,exported_at:payload.exported_at,counts:{memories:payload.memories?.length||0,conversations:payload.conversations?.length||0,archive_messages:payload.archive_messages?.length||0}}}; const mk=await hkdf(c.master,utf8(c.vaultId),utf8('MEL-ShardVault/v1/manifest-mac')); manifest.manifestMac=b64u(await hmac(mk,utf8(stable(manifest)))); const r=await fetchTimed(env.MEL_INVENTORY_APPEND_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(manifest)}); if(!r.ok)throw new Error(`INVENTORY_APPEND_${r.status}`); return manifest;
}

export async function runShardVaultCycle(env,{force=false}={}){
  if(String(env?.MEL_SHARDVAULT_ENABLED||'false')!=='true')return {ok:true,enabled:false,skipped:true,reason:'DISABLED'};
  let c; try{c=config(env);}catch(error){return {ok:false,enabled:true,skipped:true,reason:'CONFIG_INVALID',error:String(error?.message||error)}}
  if(!c.ok)return {ok:false,enabled:true,skipped:true,reason:'CONFIG_MISSING',missing:c.missing};
  if(c.n<=c.k)return {ok:false,enabled:true,skipped:true,reason:'REDUNDANCY_INVALID'};
  try{
    const rows=await inventoryList(env,c); const last=latest(rows); const age=last?Date.now()-Date.parse(last.createdAt||0):Infinity; const health=last?await verifyLatest(c,last):{checked:0,healthy:0};
    if(!force&&last&&Number.isFinite(age)&&age<c.intervalMs)return {ok:true,enabled:true,skipped:true,reason:'INTERVAL_NOT_DUE',latest_snapshot:last.snapshotId,age_ms:age,health};
    const payload=await buildMemoryExportPayload(env,{limit:Number(env.MEL_SHARDVAULT_EXPORT_LIMIT)||10000}); const manifest=await publishSnapshot(env,c,payload); return {ok:true,enabled:true,skipped:false,snapshot_id:manifest.snapshotId,created_at:manifest.createdAt,shards:manifest.totalShards,data_shards:manifest.dataShards,health_before:health,counts:manifest.source.counts};
  }catch(error){return {ok:false,enabled:true,skipped:false,reason:'CYCLE_FAILED',error:String(error?.message||error)};}
}
