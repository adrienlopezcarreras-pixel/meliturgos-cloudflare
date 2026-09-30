function clean(v,max=240){return String(v||'').trim().slice(0,max);}

function present(env,key){
  const k=clean(key,160);
  if(!k)return false;
  try{return String(env?.[k]||'').trim().length>0;}catch{return false;}
}

function safeRef(key){
  const k=clean(key,160);
  return /^[A-Z][A-Z0-9_]{2,159}$/.test(k)?k:null;
}

export function evaluateCandidateReadiness(candidate,{
  env={},
  descriptor=null,
  requiredConfig=[],
  requiredSecrets=[],
  requireZeroCost=true,
}={}){
  const configRefs=(Array.isArray(requiredConfig)?requiredConfig:[])
    .map(safeRef).filter(Boolean);
  const secretRefs=(Array.isArray(requiredSecrets)?requiredSecrets:[])
    .map(safeRef).filter(Boolean);

  const configStatus=configRefs.map(ref=>({ref,present:present(env,ref)}));
  const secretStatus=secretRefs.map(ref=>({ref,present:present(env,ref)}));

  const cost=descriptor?.cost_provenance||descriptor?.costProvenance||null;
  const zeroCostVerified = requireZeroCost
    ? Number(descriptor?.added_cost_eur??descriptor?.estimated_cost??descriptor?.estimatedCost)===0
      && cost?.verified===true
      && Number(cost?.addedCost??cost?.added_cost_eur??0)===0
      && cost?.authorization?.approved===true
    : true;

  const missingConfig=configStatus.filter(x=>!x.present).map(x=>x.ref);
  const missingSecrets=secretStatus.filter(x=>!x.present).map(x=>x.ref);
  const adapterReady=Boolean(descriptor?.id&&descriptor?.provider);

  const ready=adapterReady
    && missingConfig.length===0
    && missingSecrets.length===0
    && zeroCostVerified;

  let reason=null;
  if(!adapterReady)reason='DESCRIPTOR_INCOMPLETE';
  else if(missingConfig.length)reason='CONFIG_REQUIRED';
  else if(missingSecrets.length)reason='CREDENTIAL_REQUIRED';
  else if(!zeroCostVerified)reason='ZERO_COST_PROOF_REQUIRED';

  return Object.freeze({
    schema:'mel.sovereignty-candidate-readiness/v1',
    layer:clean(candidate?.layer,80)||null,
    candidate_id:clean(candidate?.id,220)||clean(descriptor?.id,220)||null,
    ready_for_live_test:ready,
    blocking_reason:reason,
    descriptor_present:adapterReady,
    zero_cost_verified:zeroCostVerified,
    config_refs:Object.freeze(configStatus),
    secret_refs:Object.freeze(secretStatus),
    missing_config:Object.freeze(missingConfig),
    missing_secrets:Object.freeze(missingSecrets),
    secret_values_exposed:false,
  });
}

export function readinessRequirementsForDescriptor(layer,descriptor={}){
  const requiredConfig=[];
  const requiredSecrets=[];

  const credential=safeRef(descriptor?.credential_ref||descriptor?.secret_env||descriptor?.secretEnv);
  if(credential)requiredSecrets.push(credential);

  for(const ref of Array.isArray(descriptor?.required_config_refs)?descriptor.required_config_refs:[]){
    const safe=safeRef(ref);if(safe)requiredConfig.push(safe);
  }
  for(const ref of Array.isArray(descriptor?.required_secret_refs)?descriptor.required_secret_refs:[]){
    const safe=safeRef(ref);if(safe)requiredSecrets.push(safe);
  }

  return Object.freeze({
    layer:clean(layer,80),
    required_config:Object.freeze([...new Set(requiredConfig)]),
    required_secrets:Object.freeze([...new Set(requiredSecrets)]),
  });
}
