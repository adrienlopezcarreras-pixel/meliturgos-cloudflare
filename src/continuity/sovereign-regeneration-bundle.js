import { verifyProviderNeutralSystemBundle } from '../portability/system-bundle.js';

const REQUIRED_RUNTIME_CONTRACTS = Object.freeze([
  'core.config',
  'memory.export',
  'planning.projects',
  'plugins.registry',
  'skills.registry',
]);

function clean(value,max=300){return String(value||'').trim().slice(0,max);}
function err(code,status=409){const e=new Error(code);e.code=code;e.status=status;return e;}

async function sha256Hex(value){
  const raw=typeof value==='string'?value:JSON.stringify(value);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
}

function stableJson(value){return JSON.stringify(stable(value));}

export async function createSovereignRegenerationBundle({
  sourceSha,
  codeReconstruction,
  runtimeBundle,
  roadmap = null,
  autonomy = null,
  recovery = {},
  generatedAt = new Date().toISOString(),
}={}) {
  const sha=clean(sourceSha,80).toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(sha)) throw err('REGEN_SOURCE_SHA_INVALID',400);

  const runtimeVerification=await verifyProviderNeutralSystemBundle(runtimeBundle);
  if(runtimeVerification?.ok!==true){
    const e=err('REGEN_RUNTIME_BUNDLE_INVALID',422);
    e.issues=runtimeVerification?.issues||[];
    throw e;
  }

  const contracts=(runtimeBundle?.manifest?.contracts||[])
    .filter(row=>row?.required!==false)
    .map(row=>String(row.id||''))
    .sort();
  for(const id of REQUIRED_RUNTIME_CONTRACTS){
    if(!contracts.includes(id)) throw err('REGEN_REQUIRED_RUNTIME_CONTRACT_MISSING:'+id,422);
  }

  const code={
    source_sha:sha,
    format:clean(codeReconstruction?.format||'RS_4_OF_7',80),
    data_shards:Number(codeReconstruction?.data_shards||4),
    total_shards:Number(codeReconstruction?.total_shards||7),
    reconstructable:codeReconstruction?.reconstructable===true,
    independent_of_primary_provider:codeReconstruction?.independent_of_primary_provider===true,
    manifest_ref:clean(codeReconstruction?.manifest_ref,500)||null,
    expected_sha256:clean(codeReconstruction?.expected_sha256,100)||null,
  };
  if(code.reconstructable!==true) throw err('REGEN_CODE_NOT_RECONSTRUCTABLE',422);
  if(code.independent_of_primary_provider!==true) throw err('REGEN_CODE_PROVIDER_INDEPENDENCE_REQUIRED',422);
  if(code.data_shards<2||code.total_shards<=code.data_shards) throw err('REGEN_CODE_SHARD_GEOMETRY_INVALID',422);

  const body={
    schema:'mel.sovereign-regeneration/v1',
    generated_at:generatedAt,
    source_sha:sha,
    code,
    runtime_bundle:runtimeBundle,
    roadmap:roadmap&&typeof roadmap==='object'?structuredClone(roadmap):null,
    autonomy:autonomy&&typeof autonomy==='object'?structuredClone(autonomy):null,
    recovery:{
      survival_modes:['DEGRADED','READ_ONLY','RECOVERY'],
      prevalidated_target_required:true,
      verified_backup_required:true,
      post_restore_smoke_required:true,
      rollback_if_source_reachable:true,
      unattended_activation_policy:'MAX_100_EMERGENCY_ONLY',
      ...recovery,
    },
  };

  const integrity=await sha256Hex(stableJson(body));
  return Object.freeze({
    ...body,
    integrity:Object.freeze({algorithm:'SHA-256',sha256:integrity}),
  });
}

export async function verifySovereignRegenerationBundle(bundle){
  const issues=[];
  if(bundle?.schema!=='mel.sovereign-regeneration/v1')issues.push('SCHEMA_INVALID');
  if(!/^[0-9a-f]{40}$/.test(String(bundle?.source_sha||'')))issues.push('SOURCE_SHA_INVALID');
  if(bundle?.code?.reconstructable!==true)issues.push('CODE_NOT_RECONSTRUCTABLE');
  if(bundle?.code?.independent_of_primary_provider!==true)issues.push('CODE_PROVIDER_INDEPENDENCE_REQUIRED');

  const runtime=await verifyProviderNeutralSystemBundle(bundle?.runtime_bundle);
  if(runtime?.ok!==true)issues.push('RUNTIME_BUNDLE_INVALID');

  const contracts=(bundle?.runtime_bundle?.manifest?.contracts||[])
    .filter(row=>row?.required!==false)
    .map(row=>String(row.id||''));
  for(const id of REQUIRED_RUNTIME_CONTRACTS){
    if(!contracts.includes(id))issues.push('RUNTIME_CONTRACT_MISSING:'+id);
  }

  const {integrity,...body}=bundle||{};
  const expected=await sha256Hex(stableJson(body));
  if(integrity?.algorithm!=='SHA-256'||String(integrity?.sha256||'')!==expected)issues.push('INTEGRITY_MISMATCH');

  return Object.freeze({
    ok:issues.length===0,
    issues:Object.freeze(issues),
    source_sha:bundle?.source_sha||null,
    required_runtime_contracts:Object.freeze([...REQUIRED_RUNTIME_CONTRACTS]),
    unattended_emergency_ready:issues.length===0
      && bundle?.recovery?.unattended_activation_policy==='MAX_100_EMERGENCY_ONLY',
  });
}

export async function planSovereignRegeneration({
  bundle,
  maxAutonomy=false,
  emergency=false,
  targetPrevalidated=false,
  ownerReachable=true,
}={}) {
  const verification=await verifySovereignRegenerationBundle(bundle);
  if(!verification.ok){
    return {ok:false,status:'REGEN_BUNDLE_INVALID',verification,activation_allowed:false};
  }

  const unattended=maxAutonomy===true
    && emergency===true
    && targetPrevalidated===true;

  return Object.freeze({
    ok:true,
    status:unattended?'REGEN_UNATTENDED_EMERGENCY_ALLOWED':'REGEN_PREPARED',
    activation_allowed:unattended,
    owner_presence_required:unattended?false:true,
    owner_reachable:ownerReachable===true,
    max_autonomy:maxAutonomy===true,
    emergency:emergency===true,
    target_prevalidated:targetPrevalidated===true,
    steps:Object.freeze([
      'RECONSTRUCT_CODE_FROM_SHARDS',
      'VERIFY_CODE_SHA',
      'VERIFY_RUNTIME_BUNDLE',
      'RESTORE_CORE_CONFIG',
      'RESTORE_MEMORY',
      'RESTORE_PROJECTS_DECISIONS_LESSONS',
      'RESTORE_SKILLS',
      'RESTORE_PLUGIN_METADATA',
      'RESTORE_ROADMAP_AND_AUTONOMY_STATE',
      'DEPLOY_TO_PREVALIDATED_RUNTIME',
      'RUN_POST_RESTORE_SMOKE',
      'ENTER_NORMAL_OR_DEGRADED_MODE',
    ]),
  });
}

export const SOVEREIGN_REGEN_REQUIRED_CONTRACTS=REQUIRED_RUNTIME_CONTRACTS;
