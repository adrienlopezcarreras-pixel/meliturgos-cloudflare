import { SourceControlAdapter } from './source-control-adapter.js';
import { getReleaseVerifiedShardVaultCodeArchive } from '../continuity/shardvault-runtime.js';

function clean(v,max=400){return String(v||'').trim().slice(0,max);}
function fail(code,status=409){const e=new Error(code);e.code=code;e.status=status;throw e;}
function validSha(v){return /^[0-9a-f]{40}$/i.test(String(v||''));}
function validRef(v){
  const s=clean(v,240);
  return Boolean(s)&&!s.includes('..')&&!s.startsWith('/')&&!s.endsWith('/')
    && /^[A-Za-z0-9._/-]+$/.test(s);
}
function validPath(v){
  const s=clean(v,500).replaceAll('\\','/');
  return Boolean(s)&&!s.startsWith('/')&&!s.split('/').includes('..');
}
function ascii(bytes,start,length){
  let out='';
  for(let i=start;i<start+length&&i<bytes.length;i++){
    const b=bytes[i];
    if(!b)break;
    out+=String.fromCharCode(b);
  }
  return out.trim();
}
function octal(bytes,start,length){
  const raw=ascii(bytes,start,length).replace(/\0/g,'').trim();
  return raw?parseInt(raw,8):0;
}
async function gunzip(bytes){
  if(typeof DecompressionStream!=='function')fail('SHARDVAULT_SOURCE_CONTROL_GZIP_UNAVAILABLE',503);
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function extractTarFile(gzipBytes,targetPath){
  const wanted=String(targetPath||'').replaceAll('\\','/').replace(/^\.\//,'');
  if(!validPath(wanted))fail('SHARDVAULT_SOURCE_CONTROL_PATH_INVALID',400);
  const tar=await gunzip(gzipBytes);
  let offset=0;
  while(offset+512<=tar.length){
    const header=tar.subarray(offset,offset+512);
    if(header.every(byte=>byte===0))break;
    const name=ascii(header,0,100);
    const prefix=ascii(header,345,155);
    const full=(prefix?prefix+'/':'')+name;
    const size=octal(header,124,12);
    const type=String.fromCharCode(header[156]||48);
    const dataStart=offset+512;
    const dataEnd=dataStart+size;
    if(dataEnd>tar.length)fail('SHARDVAULT_SOURCE_CONTROL_TAR_TRUNCATED',409);
    const normalized=full.replace(/^\.\//,'');
    if((type==='0'||type==='\0')&&normalized===wanted){
      return new TextDecoder().decode(tar.subarray(dataStart,dataEnd));
    }
    offset=dataStart+Math.ceil(size/512)*512;
  }
  return null;
}
async function sha1Hex(value){
  const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function ensureTables(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS mel_shardvault_source_refs(
    ref TEXT PRIMARY KEY,
    sha TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS mel_shardvault_source_commits(
    sha TEXT PRIMARY KEY,
    parent_sha TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    message TEXT,
    created_at INTEGER NOT NULL
  )`).run();
}
export function createShardVaultSourceControlAdapter({
  env,
  expectedSha=String(env?.MEL_DEPLOYED_GIT_SHA||'').trim().toLowerCase(),
  archiveLoader=getReleaseVerifiedShardVaultCodeArchive,
}={}){
  if(!env?.DB)fail('SHARDVAULT_SOURCE_CONTROL_DB_REQUIRED',503);
  const expected=String(expectedSha||'').trim().toLowerCase();
  if(!validSha(expected))fail('SHARDVAULT_SOURCE_CONTROL_EXPECTED_SHA_REQUIRED',400);
  let archivePromise=null;
  const loadArchive=async()=>{
    if(!archivePromise){
      archivePromise=(async()=>{
        const archive=await archiveLoader(env);
        if(archive?.ok!==true)fail(archive?.status||'SHARDVAULT_SOURCE_CONTROL_ARCHIVE_UNAVAILABLE',503);
        const sourceSha=String(archive?.source_sha||'').toLowerCase();
        if(sourceSha!==expected)fail('SHARDVAULT_SOURCE_CONTROL_SHA_MISMATCH',409);
        if(archive?.external_reconstruction_verified!==true||archive?.independent_of_local_archive!==true){
          fail('SHARDVAULT_SOURCE_CONTROL_INDEPENDENCE_REQUIRED',409);
        }
        if(!(archive?.bytes instanceof Uint8Array))fail('SHARDVAULT_SOURCE_CONTROL_ARCHIVE_BYTES_REQUIRED',503);
        return archive;
      })();
    }
    return archivePromise;
  };
  const resolveRef=async ref=>{
    const value=clean(ref,240);
    if(validSha(value))return value.toLowerCase();
    if(value==='main')return expected;
    if(!validRef(value))fail('SHARDVAULT_SOURCE_CONTROL_REF_INVALID',400);
    await ensureTables(env.DB);
    const row=await env.DB.prepare('SELECT sha FROM mel_shardvault_source_refs WHERE ref=? LIMIT 1').bind(value).first();
    if(!row?.sha)fail('SHARDVAULT_SOURCE_CONTROL_REF_NOT_FOUND',404);
    return String(row.sha).toLowerCase();
  };
  return new SourceControlAdapter({
    id:'shardvault-reconstructed-source-control',
    provider:'shardvault-external+d1-overlay',
    health:async()=>{
      try{
        const archive=await loadArchive();
        return{
          ok:true,status:'HEALTHY',source_sha:archive.source_sha,
          external_reconstruction_verified:true,
          independent_of_local_archive:true,
        };
      }catch(error){
        return{ok:false,status:'UNAVAILABLE',code:clean(error?.code||error?.message,180)};
      }
    },
    readRef:async({ref}={})=>{
      await loadArchive();
      return{ok:true,sha:await resolveRef(ref)};
    },
    readFile:async({ref,path}={})=>{
      const archive=await loadArchive();
      const normalized=String(path||'').replaceAll('\\','/').replace(/^\.\//,'');
      if(!validPath(normalized))fail('SHARDVAULT_SOURCE_CONTROL_PATH_INVALID',400);
      const sha=await resolveRef(ref);
      await ensureTables(env.DB);
      const overlay=await env.DB.prepare('SELECT path,content,parent_sha FROM mel_shardvault_source_commits WHERE sha=? LIMIT 1')
        .bind(sha).first();
      if(overlay&&String(overlay.path)===normalized){
        return{ok:true,content:String(overlay.content)};
      }
      const baseSha=overlay?.parent_sha?String(overlay.parent_sha).toLowerCase():sha;
      if(baseSha!==expected)fail('SHARDVAULT_SOURCE_CONTROL_BASE_SHA_UNKNOWN',409);
      const content=await extractTarFile(archive.bytes,normalized);
      if(content==null)fail('SHARDVAULT_SOURCE_CONTROL_FILE_NOT_FOUND',404);
      return{ok:true,content};
    },
    createRef:async({ref,sha}={})=>{
      await loadArchive();
      const name=clean(ref,240),base=String(sha||'').toLowerCase();
      if(!validRef(name)||!validSha(base))fail('SHARDVAULT_SOURCE_CONTROL_REF_INVALID',400);
      await ensureTables(env.DB);
      await env.DB.prepare(`INSERT INTO mel_shardvault_source_refs(ref,sha,updated_at) VALUES(?,?,?)
        ON CONFLICT(ref) DO UPDATE SET sha=excluded.sha,updated_at=excluded.updated_at`)
        .bind(name,base,Date.now()).run();
      return{ok:true,ref:name,sha:base};
    },
    updateRef:async({ref,sha}={})=>{
      await loadArchive();
      const name=clean(ref,240),next=String(sha||'').toLowerCase();
      if(!validRef(name)||!validSha(next))fail('SHARDVAULT_SOURCE_CONTROL_REF_INVALID',400);
      await ensureTables(env.DB);
      await env.DB.prepare(`INSERT INTO mel_shardvault_source_refs(ref,sha,updated_at) VALUES(?,?,?)
        ON CONFLICT(ref) DO UPDATE SET sha=excluded.sha,updated_at=excluded.updated_at`)
        .bind(name,next,Date.now()).run();
      return{ok:true,ref:name,sha:next};
    },
    writeFile:async({ref,path,content,message}={})=>{
      await loadArchive();
      const name=clean(ref,240);
      const normalized=String(path||'').replaceAll('\\','/').replace(/^\.\//,'');
      if(!validRef(name)||!validPath(normalized))fail('SHARDVAULT_SOURCE_CONTROL_WRITE_INVALID',400);
      const parent=await resolveRef(name);
      const body=String(content??'').slice(0,256*1024);
      const candidate=await sha1Hex(JSON.stringify({parent,path:normalized,content:body,message:clean(message,500)}));
      await ensureTables(env.DB);
      await env.DB.prepare(`INSERT OR REPLACE INTO mel_shardvault_source_commits(
        sha,parent_sha,path,content,message,created_at
      ) VALUES(?,?,?,?,?,?)`).bind(candidate,parent,normalized,body,clean(message,500)||null,Date.now()).run();
      await env.DB.prepare(`INSERT INTO mel_shardvault_source_refs(ref,sha,updated_at) VALUES(?,?,?)
        ON CONFLICT(ref) DO UPDATE SET sha=excluded.sha,updated_at=excluded.updated_at`)
        .bind(name,candidate,Date.now()).run();
      return{ok:true,sha:candidate,ref:name,path:normalized};
    },
    compareRefs:async({base,head}={})=>{
      await loadArchive();
      const baseSha=await resolveRef(base);
      const headSha=await resolveRef(head);
      if(baseSha===headSha)return{ok:true,ahead_by:0,behind_by:0};
      await ensureTables(env.DB);
      const headCommit=await env.DB.prepare('SELECT parent_sha FROM mel_shardvault_source_commits WHERE sha=? LIMIT 1').bind(headSha).first();
      if(String(headCommit?.parent_sha||'').toLowerCase()===baseSha)return{ok:true,ahead_by:1,behind_by:0};
      const baseCommit=await env.DB.prepare('SELECT parent_sha FROM mel_shardvault_source_commits WHERE sha=? LIMIT 1').bind(baseSha).first();
      if(String(baseCommit?.parent_sha||'').toLowerCase()===headSha)return{ok:true,ahead_by:0,behind_by:1};
      return{ok:false,status:'SHARDVAULT_SOURCE_CONTROL_COMPARE_UNRELATED'};
    },
  });
}

export const __shardVaultSourceControlTest=Object.freeze({extractTarFile,validRef,validPath});
