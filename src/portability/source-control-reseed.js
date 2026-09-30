import { SourceControlAdapter, proveSourceControlAdapter } from './source-control-adapter.js';

function clean(v,max=300){return String(v||'').trim().slice(0,max);}
function err(code,status=409){const e=new Error(code);e.code=code;e.status=status;return e;}

export function validateRecoveredSource({
  reconstruction,
  expectedSha,
}={}){
  const sha=clean(expectedSha,80).toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(sha))throw err('SOURCE_RESEED_EXPECTED_SHA_INVALID',400);
  if(reconstruction?.ok!==true)throw err('SOURCE_RESEED_RECONSTRUCTION_REQUIRED');
  if(reconstruction?.status!=='CODE_RECONSTRUCTION_VERIFIED')throw err('SOURCE_RESEED_RECONSTRUCTION_UNVERIFIED');
  if(clean(reconstruction?.git_sha,80).toLowerCase()!==sha)throw err('SOURCE_RESEED_SHA_MISMATCH');
  if(reconstruction?.independent_of_local_archive!==true)throw err('SOURCE_RESEED_INDEPENDENCE_REQUIRED');
  if(!/^[0-9a-f]{64}$/i.test(clean(reconstruction?.sha256,80)))throw err('SOURCE_RESEED_ARCHIVE_HASH_REQUIRED');
  return {
    ok:true,
    source_sha:sha,
    archive_sha256:clean(reconstruction.sha256,80).toLowerCase(),
    reconstructed_bytes:Number(reconstruction.reconstructed_bytes)||0,
    replication_mode:clean(reconstruction.replication_mode,80)||null,
    used_endpoints:Array.isArray(reconstruction.used_endpoints)?reconstruction.used_endpoints.map(x=>clean(x,200)).filter(Boolean):[],
  };
}

export async function reseedRecoveredSourceControl({
  reconstruction,
  expectedSha,
  targetAdapter,
  materializeRecoveredTree,
  importRecoveredTree,
  targetBranch='main',
}={}){
  const source=validateRecoveredSource({reconstruction,expectedSha});
  if(!(targetAdapter instanceof SourceControlAdapter))throw err('SOURCE_RESEED_TARGET_ADAPTER_REQUIRED',400);
  if(typeof materializeRecoveredTree!=='function')throw err('SOURCE_RESEED_MATERIALIZER_REQUIRED',400);
  if(typeof importRecoveredTree!=='function')throw err('SOURCE_RESEED_IMPORTER_REQUIRED',400);

  const tree=await materializeRecoveredTree({reconstruction,source});
  if(tree?.ok!==true||!tree?.ref)throw err('SOURCE_RESEED_TREE_MATERIALIZATION_FAILED');

  const imported=await importRecoveredTree({
    adapter:targetAdapter,
    tree,
    source,
    targetBranch:clean(targetBranch,160)||'main',
    commitMessage:`MEL sovereign recovery from ${source.source_sha}`,
  });
  if(imported?.ok!==true)throw err('SOURCE_RESEED_IMPORT_FAILED');

  const proof=await proveSourceControlAdapter(targetAdapter,{
    scratchPrefix:'mel-reseed-proof',
  });
  if(proof?.ok!==true)throw err('SOURCE_RESEED_TARGET_PROOF_FAILED');

  return {
    ok:true,
    status:'SOURCE_CONTROL_RESEEDED_AND_VERIFIED',
    recovered_source_sha:source.source_sha,
    recovered_archive_sha256:source.archive_sha256,
    target_provider:targetAdapter.provider,
    target_adapter_id:targetAdapter.id,
    target_branch:clean(targetBranch,160)||'main',
    imported_commit_sha:clean(imported.commit_sha,80)||null,
    target_proof:proof,
    original_github_required:false,
  };
}

export function sourceControlEmergencyReadiness({
  reconstruction,
  expectedSha,
  prevalidatedTargets=[],
}={}){
  let source;
  try{source=validateRecoveredSource({reconstruction,expectedSha});}
  catch(error){
    return {ok:false,status:'SOURCE_CONTROL_RECOVERY_NOT_READY',reason:error.code||error.message,targets:[]};
  }
  const targets=(Array.isArray(prevalidatedTargets)?prevalidatedTargets:[])
    .filter(row=>row?.prevalidated===true&&row?.layer==='source_control'&&row?.id)
    .map(row=>({id:clean(row.id,200),provider:clean(row.provider,200)}));
  return {
    ok:targets.length>0,
    status:targets.length>0?'SOURCE_CONTROL_RECOVERY_READY':'SOURCE_CONTROL_TARGET_MISSING',
    source,
    targets,
    github_required:false,
  };
}
