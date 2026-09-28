const SHA_RE=/^[0-9a-f]{40}$/i;
const INTEGRITY_RE=/^[0-9a-f]{64}$/i;
const DEFAULT_MAX_AGE_MS=26*60*60*1000;

function json(body,status=200){
  return Response.json(body,{status,headers:{'cache-control':'no-store'}});
}

function validToken(expected,supplied){
  const a=String(expected||'');
  const b=String(supplied||'');
  if(a.length<32 || a.length!==b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

export function selectVerifiedBackupCandidate(rows,{nowMs=Date.now(),maxAgeMs=DEFAULT_MAX_AGE_MS}={}){
  for(const row of Array.isArray(rows)?rows:[]){
    let meta={};
    try{meta=JSON.parse(String(row?.metadata_json||'{}'));}catch{continue;}
    const id=String(row?.id||'').trim();
    const objectKey=String(row?.object_key||meta?.objectKey||'').trim();
    const integrity=String(meta?.integritySha256||'').toLowerCase();
    const restoreIntegrity=String(meta?.restoreIntegritySha256||'').toLowerCase();
    const restoreSha=String(meta?.restoreDeployedGitSha||'').toLowerCase();
    const createdAt=String(meta?.createdAt||new Date(Number(row?.created_at)||0).toISOString());
    const createdMs=Date.parse(createdAt);
    const valid=Boolean(id)
      && objectKey===`backups/system/${id}.enc.json`
      && meta?.encrypted===true
      && meta?.verified===true
      && meta?.restoreVerified===true
      && INTEGRITY_RE.test(integrity)
      && integrity===restoreIntegrity
      && SHA_RE.test(restoreSha)
      && Number.isFinite(createdMs)
      && createdMs<=nowMs
      && nowMs-createdMs<=maxAgeMs;
    if(valid){
      return {id,objectKey,integrity,restoreSha,createdAt};
    }
  }
  return null;
}

export function releaseBindingPayload(candidate,deployedSha,boundAt){
  return {
    schema:'MEL_RELEASE_BACKUP_BINDING_V1',
    deployed_sha:String(deployedSha||'').toLowerCase(),
    snapshot_id:String(candidate?.id||''),
    snapshot_integrity_sha256:String(candidate?.integrity||'').toLowerCase(),
    snapshot_deployed_sha:String(candidate?.restoreSha||'').toLowerCase(),
    snapshot_created_at:String(candidate?.createdAt||''),
    bound_at:Number(boundAt||0),
  };
}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export default {
  async fetch(request,env){
    if(request.method!=='POST') return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    if(!validToken(env?.PREDEPLOY_BIND_TOKEN,request.headers.get('x-mel-predeploy-binder'))){
      return json({ok:false,code:'BINDER_AUTH_REQUIRED'},401);
    }
    const deployedSha=String(env?.TARGET_DEPLOYED_SHA||'').trim().toLowerCase();
    if(!SHA_RE.test(deployedSha)) return json({ok:false,code:'TARGET_DEPLOYED_SHA_INVALID'},503);
    if(!env?.DB?.prepare) return json({ok:false,code:'D1_NOT_BOUND'},503);

    try{
      const listed=await env.DB.prepare(
        "SELECT id,object_key,metadata_json,created_at FROM backup_objects WHERE object_key LIKE 'backups/system/%' ORDER BY created_at DESC LIMIT 100"
      ).all();
      const rows=Array.isArray(listed?.results)?listed.results:[];
      const nowMs=Date.now();
      const candidate=selectVerifiedBackupCandidate(rows,{nowMs});
      if(!candidate) return json({ok:false,code:'NO_RECENT_VERIFIED_SYSTEM_BACKUP'},409);

      const binding=releaseBindingPayload(candidate,deployedSha,nowMs);
      const bindingSha256=await sha256Hex(JSON.stringify(binding));
      await env.DB.prepare(`INSERT OR REPLACE INTO release_backup_bindings(
        deployed_sha,snapshot_id,snapshot_integrity_sha256,snapshot_deployed_sha,snapshot_created_at,bound_at,binding_sha256
      ) VALUES(?,?,?,?,?,?,?)`)
        .bind(
          binding.deployed_sha,
          binding.snapshot_id,
          binding.snapshot_integrity_sha256,
          binding.snapshot_deployed_sha,
          binding.snapshot_created_at,
          binding.bound_at,
          bindingSha256,
        )
        .run();

      return json({
        ok:true,
        status:'RELEASE_BACKUP_BOUND',
        deployed_sha:binding.deployed_sha,
        snapshot_id:binding.snapshot_id,
        snapshot_deployed_sha:binding.snapshot_deployed_sha,
        snapshot_created_at:binding.snapshot_created_at,
        binding_sha256:bindingSha256,
      });
    }catch(error){
      return json({ok:false,code:'BINDER_D1_FAILED',detail:String(error?.message||error).slice(0,160)},503);
    }
  },
};
