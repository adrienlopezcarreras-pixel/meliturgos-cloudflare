import { evaluateCandidateReadiness, readinessRequirementsForDescriptor } from './sovereignty-candidate-readiness.js';
import { prevalidateConfiguredAiAlternatives } from './ai-alternative-prevalidator.js';
import { prevalidateInfrastructureAlternative } from './infrastructure-alternative-prevalidator.js';

const INFRA_LAYERS=new Set([
  'runtime','storage','database','source_control',
  'ci_cd','secrets_identity','scheduler','observability',
]);

function clean(v,max=400){return String(v||'').trim().slice(0,max);}

export async function validateSovereigntyCandidates({
  candidateStore,
  registryStore,
  resolveCandidate,
  env={},
  now=Date.now(),
  limit=3,
}={}){
  if(!candidateStore||typeof candidateStore.list!=='function'||typeof candidateStore.setStatus!=='function'){
    throw Object.assign(new TypeError('SOVEREIGNTY_CANDIDATE_STORE_REQUIRED'),{code:'SOVEREIGNTY_CANDIDATE_STORE_REQUIRED'});
  }
  if(!registryStore||typeof registryStore.load!=='function'||typeof registryStore.save!=='function'){
    throw Object.assign(new TypeError('SOVEREIGNTY_REGISTRY_STORE_REQUIRED'),{code:'SOVEREIGNTY_REGISTRY_STORE_REQUIRED'});
  }
  if(typeof resolveCandidate!=='function'){
    throw Object.assign(new TypeError('SOVEREIGNTY_CANDIDATE_RESOLVER_REQUIRED'),{code:'SOVEREIGNTY_CANDIDATE_RESOLVER_REQUIRED'});
  }

  const candidates=(await candidateStore.list({status:'UNVERIFIED',limit:Math.max(1,Math.min(20,Number(limit)||3))}))
    .slice(0,Math.max(1,Math.min(20,Number(limit)||3)));
  let registry=await registryStore.load();
  const results=[];

  for(const candidate of candidates){
    await candidateStore.setStatus({
      layer:candidate.layer,id:candidate.id,status:'TESTING',
      metadata:{started_at:new Date(now).toISOString()},
    });

    let resolved;
    try{
      resolved=await resolveCandidate(candidate);
    }catch(error){
      await candidateStore.setStatus({
        layer:candidate.layer,id:candidate.id,status:'BLOCKED',
        metadata:{reason:'RESOLUTION_FAILED',code:clean(error?.code||error?.message,180)},
      });
      results.push({
        layer:candidate.layer,id:candidate.id,status:'BLOCKED',reason:'RESOLUTION_FAILED',
        code:clean(error?.code||error?.message,180)||null,
      });
      continue;
    }

    if(!resolved?.descriptor||!resolved?.adapter){
      await candidateStore.setStatus({
        layer:candidate.layer,id:candidate.id,status:'BLOCKED',
        metadata:{reason:'ADAPTER_NOT_AVAILABLE'},
      });
      results.push({layer:candidate.layer,id:candidate.id,status:'BLOCKED',reason:'ADAPTER_NOT_AVAILABLE'});
      continue;
    }

    const requirements=readinessRequirementsForDescriptor(candidate.layer,resolved.descriptor);
    const readiness=evaluateCandidateReadiness(candidate,{
      env:resolved.env||env,
      descriptor:resolved.descriptor,
      requiredConfig:requirements.required_config,
      requiredSecrets:requirements.required_secrets,
      requireZeroCost:true,
    });
    if(!readiness.ready_for_live_test){
      await candidateStore.setStatus({
        layer:candidate.layer,id:candidate.id,status:'BLOCKED',
        metadata:{
          reason:readiness.blocking_reason,
          missing_config:readiness.missing_config,
          missing_secrets:readiness.missing_secrets,
          zero_cost_verified:readiness.zero_cost_verified,
          secret_values_exposed:false,
        },
      });
      results.push({
        layer:candidate.layer,
        id:candidate.id,
        status:'BLOCKED',
        reason:readiness.blocking_reason,
      });
      continue;
    }

    let validation;
    try{
      if(candidate.layer==='ai'){
        // AI candidate must already be materialized into provider-neutral env config by resolver.
        validation=await prevalidateConfiguredAiAlternatives({
          env:resolved.env||env,
          registry,
          now,
          fetchImpl:resolved.fetchImpl||fetch,
        });
        const matched=validation.registry?.layers?.ai?.find(row=>row.id===resolved.descriptor.id);
        validation={
          ok:Boolean(matched?.prevalidated),
          status:matched?.prevalidated?'AI_ALTERNATIVE_PREVALIDATED':'AI_LIVE_PROOF_FAILED',
          registry:validation.registry,
          detail:validation.results?.find(row=>row.id===resolved.descriptor.id)||null,
        };
      }else if(INFRA_LAYERS.has(candidate.layer)){
        validation=await prevalidateInfrastructureAlternative({
          layer:candidate.layer,
          descriptor:resolved.descriptor,
          adapter:resolved.adapter,
          registry,
          context:resolved.context||{},
          now,
        });
      }else if(candidate.layer==='backup_restore'){
        if(resolved.prevalidated===true&&resolved.proof?.ok===true){
          const byId=new Map((registry?.all||[]).map(row=>[row.id,row]));
          byId.set(resolved.descriptor.id,{
            id:resolved.descriptor.id,
            layer:'backup_restore',
            provider:resolved.descriptor.provider,
            adapter_id:resolved.descriptor.adapter_id||resolved.descriptor.id,
            added_cost_eur:0,
            cost_mode:'ZERO_EURO_VERIFIED',
            proof:{
              isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
              verified_at:new Date(now).toISOString(),
              expires_at:new Date(now+30*24*60*60*1000).toISOString(),
              evidence_ref:clean(resolved.proof.evidence_ref,500)||null,
              source_sha:clean(resolved.proof.source_sha,80)||null,
            },
          });
          const { createAlternativeRegistry } = await import('./prevalidated-alternative-registry.js');
          validation={ok:true,status:'BACKUP_ALTERNATIVE_PREVALIDATED',registry:createAlternativeRegistry([...byId.values()],{now})};
        }else{
          validation={ok:false,status:'BACKUP_LIVE_PROOF_FAILED',registry};
        }
      }else{
        validation={ok:false,status:'CANDIDATE_LAYER_UNSUPPORTED',registry};
      }
    }catch(error){
      validation={ok:false,status:'VALIDATION_EXCEPTION',code:clean(error?.code||error?.message,180),registry};
    }

    if(validation?.ok===true){
      registry=validation.registry;
      await registryStore.save(registry);
      await candidateStore.setStatus({
        layer:candidate.layer,id:candidate.id,status:'PREVALIDATED',
        metadata:{
          validated_at:new Date(now).toISOString(),
          validation_status:validation.status,
        },
      });
      results.push({layer:candidate.layer,id:candidate.id,status:'PREVALIDATED',validation_status:validation.status});
    }else{
      await candidateStore.setStatus({
        layer:candidate.layer,id:candidate.id,status:'BLOCKED',
        metadata:{
          blocked_at:new Date(now).toISOString(),
          validation_status:validation?.status||'UNKNOWN',
          code:clean(validation?.code,180)||null,
        },
      });
      results.push({
        layer:candidate.layer,id:candidate.id,status:'BLOCKED',
        validation_status:validation?.status||'UNKNOWN',
        code:clean(validation?.code,180)||null,
      });
    }
  }

  return{
    ok:true,
    processed:results.length,
    prevalidated:results.filter(r=>r.status==='PREVALIDATED').length,
    blocked:results.filter(r=>r.status==='BLOCKED').length,
    results,
  };
}

export const SOVEREIGNTY_CANDIDATE_VALIDATOR_INFRA_LAYERS=Object.freeze([...INFRA_LAYERS]);
