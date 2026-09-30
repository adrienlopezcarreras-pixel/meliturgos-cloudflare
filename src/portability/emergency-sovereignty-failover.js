const EMERGENCY_CODES = new Set([
  'SERVICE_EOL_IMMINENT',
  'SERVICE_SHUTDOWN_ANNOUNCED',
  'SERVICE_UNREACHABLE_CRITICAL',
  'AUTH_ACCESS_LOST',
  'MIGRATION_DEADLINE_IMMINENT',
  'PROVIDER_POLICY_FORCES_EXIT',
]);

function clean(value,max=300){return String(value||'').trim().slice(0,max);}
function fail(code,status=409){const e=new Error(code);e.code=code;e.status=status;return e;}

export function classifyEmergencySovereigntyTrigger({
  code,
  deadlineAt,
  now=Date.now(),
  serviceReachable=true,
  ownerReachable=true,
}={}) {
  const normalized=clean(code,120);
  const deadline=Number.isFinite(Date.parse(String(deadlineAt||'')))?Date.parse(String(deadlineAt)):null;
  const hoursLeft=deadline==null?null:Math.max(0,(deadline-now)/3600000);
  const absoluteEmergency =
    EMERGENCY_CODES.has(normalized)
    || serviceReachable===false
    || (hoursLeft!=null && hoursLeft<=24);

  return {
    emergency:absoluteEmergency,
    code:normalized||null,
    hours_left:hoursLeft,
    owner_reachable:ownerReachable===true,
    owner_unavailable:ownerReachable!==true,
    service_reachable:serviceReachable===true,
  };
}

export async function executeEmergencySovereigntyFailover({
  maxAutonomy=false,
  trigger,
  layer,
  currentAdapter,
  approvedAlternatives=[],
  selectAlternative,
  createVerifiedBackup,
  testAlternative,
  activateAlternative,
  smokeAlternative,
  rollbackCurrent,
  enterSurvivalMode,
}={}) {
  if(maxAutonomy!==true) throw fail('EMERGENCY_FAILOVER_MAX_AUTONOMY_REQUIRED',403);
  const classified=classifyEmergencySovereigntyTrigger(trigger||{});
  if(classified.emergency!==true) throw fail('EMERGENCY_FAILOVER_TRIGGER_REQUIRED',409);

  const alternatives=(Array.isArray(approvedAlternatives)?approvedAlternatives:[])
    .filter(row=>row?.prevalidated===true && row?.id)
    .map(row=>({...row,id:clean(row.id,200)}));

  if(!alternatives.length){
    if(typeof enterSurvivalMode==='function'){
      const survival=await enterSurvivalMode({
        layer:clean(layer,80),
        reason:'NO_PREVALIDATED_ALTERNATIVE',
        trigger:classified,
      });
      return {
        ok:false,
        status:'EMERGENCY_SURVIVAL_MODE',
        migrated:false,
        survival:survival||null,
        trigger:classified,
      };
    }
    throw fail('EMERGENCY_NO_PREVALIDATED_ALTERNATIVE',503);
  }

  if(typeof createVerifiedBackup!=='function') throw fail('EMERGENCY_BACKUP_REQUIRED',500);
  const backup=await createVerifiedBackup({layer,currentAdapter,trigger:classified});
  if(backup?.ok!==true || backup?.verified!==true) throw fail('EMERGENCY_BACKUP_VERIFICATION_FAILED',500);

  let selected;
  if(typeof selectAlternative==='function'){
    selected=await selectAlternative({layer,currentAdapter,alternatives,trigger:classified});
  }else{
    selected=alternatives[0];
  }
  if(!selected?.id || !alternatives.some(row=>row.id===selected.id)) throw fail('EMERGENCY_ALTERNATIVE_SELECTION_INVALID',500);

  if(typeof testAlternative!=='function') throw fail('EMERGENCY_ALTERNATIVE_TEST_REQUIRED',500);
  const tested=await testAlternative({layer,currentAdapter,candidate:selected,trigger:classified});
  if(tested?.ok!==true){
    if(typeof enterSurvivalMode==='function'){
      const survival=await enterSurvivalMode({layer,reason:'ALTERNATIVE_TEST_FAILED',candidate:selected.id,trigger:classified});
      return {ok:false,status:'EMERGENCY_SURVIVAL_MODE',migrated:false,candidate:selected.id,tested,survival,trigger:classified};
    }
    return {ok:false,status:'EMERGENCY_ALTERNATIVE_REJECTED',migrated:false,candidate:selected.id,tested,trigger:classified};
  }

  if(typeof activateAlternative!=='function'||typeof smokeAlternative!=='function') throw fail('EMERGENCY_SWITCH_OPERATIONS_REQUIRED',500);
  const activated=await activateAlternative({layer,from:currentAdapter,to:selected.id,backup,trigger:classified});
  if(activated?.ok!==true) throw fail('EMERGENCY_ACTIVATION_FAILED',500);

  let smoke;
  try{smoke=await smokeAlternative({layer,activeAdapter:selected.id,trigger:classified});}
  catch(e){smoke={ok:false,code:clean(e?.code||e?.message||'EMERGENCY_SMOKE_FAILED',180)};}

  if(smoke?.ok===true){
    return {
      ok:true,
      status:'EMERGENCY_FAILOVER_VERIFIED',
      migrated:true,
      layer:clean(layer,80),
      previous_adapter:clean(currentAdapter,200),
      active_adapter:selected.id,
      backup_id:backup.id||null,
      trigger:classified,
      owner_presence_required:false,
    };
  }

  if(classified.service_reachable===true && typeof rollbackCurrent==='function'){
    const rollback=await rollbackCurrent({layer,from:selected.id,to:currentAdapter,backup,trigger:classified});
    if(rollback?.ok===true){
      return {
        ok:false,
        status:'EMERGENCY_FAILOVER_ROLLED_BACK',
        migrated:false,
        active_adapter:clean(currentAdapter,200),
        failed_adapter:selected.id,
        rollback_ok:true,
        trigger:classified,
      };
    }
  }

  if(typeof enterSurvivalMode==='function'){
    const survival=await enterSurvivalMode({layer,reason:'POST_SWITCH_SMOKE_FAILED_NO_SAFE_ROLLBACK',candidate:selected.id,trigger:classified});
    return {
      ok:false,
      status:'EMERGENCY_SURVIVAL_MODE',
      migrated:false,
      candidate:selected.id,
      smoke,
      survival,
      trigger:classified,
    };
  }

  throw fail('EMERGENCY_FAILOVER_UNRECOVERABLE',500);
}

export const EMERGENCY_SOVEREIGNTY_CODES=Object.freeze([...EMERGENCY_CODES]);
