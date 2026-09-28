const SHA40=/^[a-f0-9]{40}$/i;
const SHA64=/^[a-f0-9]{64}$/i;
const SYSTEM_BACKUP_PREFIX='backups/system/';
const BOOTSTRAP_MAX_AGE_MS=48*60*60*1000;

function parseMetadata(raw){
  try{return raw?JSON.parse(raw):{};}catch{return {};}
}

export function selectVerifiedCandidate(rows,{nowMs=Date.now(),maxAgeMs=BOOTSTRAP_MAX_AGE_MS}={}){
  for(const row of Array.isArray(rows)?rows:[]){
    const meta=parseMetadata(row?.metadata_json);
    const id=String(row?.id||'');
    const objectKey=String(row?.object_key||'');
    const integrity=String(meta?.integritySha256||'').toLowerCase();
    const restoreIntegrity=String(meta?.restoreIntegritySha256||'').toLowerCase();
    const restoreSha=String(meta?.restoreDeployedGitSha||'').toLowerCase();
    const createdAt=String(meta?.createdAt||new Date(Number(row?.created_at)||0).toISOString());
    const createdMs=Date.parse(createdAt);
    const expectedKey=id?`${SYSTEM_BACKUP_PREFIX}${id}.enc.json`:'';
    const valid=Boolean(id)
      && meta?.encrypted===true
      && meta?.verified===true
      && meta?.restoreVerified===true
      && SHA64.test(integrity)
      && integrity===restoreIntegrity
      && SHA40.test(restoreSha)
      && objectKey===expectedKey
      && Number.isFinite(createdMs)
      && createdMs<=nowMs
      && nowMs-createdMs<=maxAgeMs;
    if(valid){
      return {id,objectKey,integrity,restoreSha,createdAt,encryptionKeyId:String(meta?.encryptionKeyId||'')||null};
    }
  }
  return null;
}

export function bindingCanonical(value={}){
  return JSON.stringify({
    schema:'MEL_RELEASE_BACKUP_BINDING_V1',
    deployed_sha:String(value.deployed_sha||'').toLowerCase(),
    snapshot_id:String(value.snapshot_id||''),
    snapshot_integrity_sha256:String(value.snapshot_integrity_sha256||'').toLowerCase(),
    snapshot_deployed_sha:String(value.snapshot_deployed_sha||'').toLowerCase(),
    snapshot_created_at:String(value.snapshot_created_at||''),
    bound_at:Number(value.bound_at||0),
  });
}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function equalToken(left,right){
  const a=await sha256Hex(left);
  const b=await sha256Hex(right);
  let diff=a.length^b.length;
  const n=Math.max(a.length,b.length);
  for(let i=0;i<n;i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}

async function jsonBody(request){
  const length=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(length)&&length>4096) throw Object.assign(new Error('REQUEST_TOO_LARGE'),{status:413});
  try{return await request.json();}catch{throw Object.assign(new Error('INVALID_JSON'),{status:400});}
}

async function ensureBindingSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS release_backup_bindings (
    deployed_sha TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL,
    snapshot_integrity_sha256 TEXT NOT NULL,
    snapshot_deployed_sha TEXT,
    snapshot_created_at TEXT NOT NULL,
    bound_at INTEGER NOT NULL,
    binding_sha256 TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_release_backup_bindings_bound_at
    ON release_backup_bindings(bound_at DESC)`).run();
}

async function bindBackup(env,targetSha){
  const result=await env.DB.prepare(
    "SELECT id,object_key,metadata_json,created_at FROM backup_objects WHERE object_key LIKE 'backups/system/%' ORDER BY created_at DESC LIMIT 100"
  ).all();
  const candidate=selectVerifiedCandidate(result?.results||[]);
  if(!candidate) return {ok:false,status:'NO_RECENT_VERIFIED_ENCRYPTED_BACKUP'};

  const object=await env.MEDIA_BUCKET.head(candidate.objectKey);
  if(!object||Number(object?.size||0)<=0){
    return {ok:false,status:'BACKUP_OBJECT_NOT_PROVEN'};
  }

  await ensureBindingSchema(env.DB);
  const boundAt=Date.now();
  const binding={
    schema:'MEL_RELEASE_BACKUP_BINDING_V1',
    deployed_sha:targetSha,
    snapshot_id:candidate.id,
    snapshot_integrity_sha256:candidate.integrity,
    snapshot_deployed_sha:candidate.restoreSha,
    snapshot_created_at:candidate.createdAt,
    bound_at:boundAt,
  };
  const bindingSha256=await sha256Hex(bindingCanonical(binding));

  await env.DB.prepare(`INSERT OR REPLACE INTO release_backup_bindings(
    deployed_sha,snapshot_id,snapshot_integrity_sha256,snapshot_deployed_sha,snapshot_created_at,bound_at,binding_sha256
  ) VALUES(?,?,?,?,?,?,?)`).bind(
    binding.deployed_sha,
    binding.snapshot_id,
    binding.snapshot_integrity_sha256,
    binding.snapshot_deployed_sha,
    binding.snapshot_created_at,
    binding.bound_at,
    bindingSha256,
  ).run();

  const stored=await env.DB.prepare(`SELECT deployed_sha,snapshot_id,snapshot_integrity_sha256,
    snapshot_deployed_sha,snapshot_created_at,bound_at,binding_sha256
    FROM release_backup_bindings WHERE deployed_sha=?`).bind(targetSha).first();

  const storedCanonical=bindingCanonical({
    schema:'MEL_RELEASE_BACKUP_BINDING_V1',
    deployed_sha:stored?.deployed_sha,
    snapshot_id:stored?.snapshot_id,
    snapshot_integrity_sha256:stored?.snapshot_integrity_sha256,
    snapshot_deployed_sha:stored?.snapshot_deployed_sha,
    snapshot_created_at:stored?.snapshot_created_at,
    bound_at:stored?.bound_at,
  });
  const storedDigest=await sha256Hex(storedCanonical);
  const verified=Boolean(stored)
    && String(stored.deployed_sha||'').toLowerCase()===targetSha
    && String(stored.snapshot_id||'')===candidate.id
    && String(stored.snapshot_integrity_sha256||'').toLowerCase()===candidate.integrity
    && String(stored.binding_sha256||'').toLowerCase()===storedDigest
    && storedDigest===bindingSha256;

  if(!verified) return {ok:false,status:'RELEASE_BACKUP_BINDING_VERIFY_FAILED'};

  return {
    ok:true,
    status:'PREDEPLOY_RELEASE_BACKUP_BOUND',
    deployed_sha:targetSha,
    snapshot_id:candidate.id,
    snapshot_deployed_sha:candidate.restoreSha,
    binding_sha256:bindingSha256,
    backup_object_present:true,
    backup_object_bytes:Number(object.size||0),
  };
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname!=='/bind') return new Response('Not Found',{status:404});
    if(request.method!=='POST') return new Response('Method Not Allowed',{status:405,headers:{allow:'POST'}});
    const supplied=request.headers.get('x-mel-predeploy-binder')||'';
    const expected=String(env?.MEL_PREDEPLOY_BINDER_TOKEN||'');
    if(!expected||!(await equalToken(supplied,expected))){
      return Response.json({ok:false,status:'BINDER_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}});
    }
    try{
      const body=await jsonBody(request);
      const targetSha=String(body?.target_sha||'').trim().toLowerCase();
      if(!SHA40.test(targetSha)){
        return Response.json({ok:false,status:'TARGET_SHA_INVALID'},{status:400,headers:{'cache-control':'no-store'}});
      }
      const result=await bindBackup(env,targetSha);
      return Response.json(result,{status:result.ok?200:409,headers:{'cache-control':'no-store'}});
    }catch(error){
      return Response.json({
        ok:false,
        status:String(error?.message||'BINDER_FAILED').slice(0,120),
      },{status:Number(error?.status)||503,headers:{'cache-control':'no-store'}});
    }
  },
};
