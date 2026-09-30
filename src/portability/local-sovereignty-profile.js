export const LOCAL_SOVEREIGNTY_PROFILE_SCHEMA='mel.local-sovereignty-profile/v1';

export const LOCAL_SOVEREIGNTY_LAYERS=Object.freeze([
  Object.freeze({layer:'runtime',candidate_id:'companion-local-runtime',provider:'local-companion-runtime',requires:['windows-companion','source-mirror']}),
  Object.freeze({layer:'storage',candidate_id:'companion-local-storage',provider:'local-companion-storage',requires:['windows-companion','local-filesystem']}),
  Object.freeze({layer:'database',candidate_id:'companion-local-db',provider:'local-companion-sqlite',requires:['windows-companion','sqlite']}),
  Object.freeze({layer:'source_control',candidate_id:'companion-local-git',provider:'local-companion-git',requires:['windows-companion','git','shardvault-source-seed']}),
  Object.freeze({layer:'ci_cd',candidate_id:'companion-local-ci',provider:'local-companion-ci',requires:['windows-companion','node','source-mirror']}),
  Object.freeze({layer:'secrets_identity',candidate_id:'companion-local-secrets',provider:'local-companion-secret-vault',requires:['windows-companion','encrypted-local-vault']}),
  Object.freeze({layer:'scheduler',candidate_id:'companion-local-scheduler',provider:'local-companion-scheduler',requires:['windows-companion','local-scheduler']}),
  Object.freeze({layer:'observability',candidate_id:'companion-local-observability',provider:'local-companion-observability',requires:['windows-companion','local-telemetry-store']}),
]);

function proofFresh(row,now){
  if(row?.prevalidated!==true)return false;
  const expires=Date.parse(String(row?.proof?.expires_at||''));
  return Number.isFinite(expires)&&expires>now;
}

export function localSovereigntyProfile({
  registry,
  device=null,
  now=Date.now(),
}={}){
  const layers=LOCAL_SOVEREIGNTY_LAYERS.map(spec=>{
    const row=(registry?.layers?.[spec.layer]||[]).find(x=>x.id===spec.candidate_id);
    const prevalidated=proofFresh(row,now);
    return Object.freeze({
      ...spec,
      device_online:device?.online===true,
      prevalidated,
      proof_expires_at:prevalidated?row.proof.expires_at:null,
      status:prevalidated?'PREVALIDATED':device?.online===true?'READY_FOR_LIVE_PROOF':'DEVICE_OFFLINE',
    });
  });
  return Object.freeze({
    schema:LOCAL_SOVEREIGNTY_PROFILE_SCHEMA,
    device_id:device?.id||null,
    device_name:device?.name||null,
    device_online:device?.online===true,
    layer_count:layers.length,
    prevalidated_count:layers.filter(x=>x.prevalidated).length,
    ready_for_live_proof_count:layers.filter(x=>x.status==='READY_FOR_LIVE_PROOF').length,
    offline_count:layers.filter(x=>x.status==='DEVICE_OFFLINE').length,
    layers:Object.freeze(layers),
  });
}
