import {createCompanionSovereigntyExecutor} from '../portability/companion-sovereignty-executor.js';
import {createCompanionLocalAiAdapter} from '../portability/companion-local-ai-adapter.js';


// MEL-UI-AUDIT-05: a deterministic *offline* acceptance classifier. A
// simulated browser/worker receipt is never independent physical hardware
// evidence. The classifier is read-only: it does not execute device commands.
export function classifyCompanionHardwareControl(control, observation = {}) {
 const id=String(control||'').trim();
 const status=String(observation?.status||'').toUpperCase();
 const source=String(observation?.source||'').toLowerCase();
 const receipt=observation?.physical_receipt;
 const blocked=reason=>({control:id,status:'BLOCKED',reason,physical_verified:false});
 if(!id)return blocked('CONTROL_UNSPECIFIED');
 const refusal=companionBlockReason(observation);
 if(refusal)return blocked(refusal);
 // Only an independently observed device receipt can satisfy an on-device
 // hardware acceptance. Test doubles, untrusted source fields and a bare
 // success boolean are not proof of a physical action.
 if(source!=='paired-windows-companion' || observation?.simulated===true
    || observation?.ok!==true || status!=='SUCCESS'
    || receipt?.kind!=='ON_DEVICE_OBSERVED'
    || String(receipt?.control||'')!==id
    || !String(receipt?.device_id||'').trim()
    || !Number.isSafeInteger(receipt?.observed_at) || receipt.observed_at<=0)
   return blocked('PHYSICAL_PROOF_MISSING');
 // This offline recipe has no authenticated server lookup. A well-shaped
 // client claim is still unverified; real device acceptance is separate.
 return blocked('PHYSICAL_PROOF_UNVERIFIED');
}

function companionBlockReason(observation={}){
 const status=String(observation?.status||'').trim().toUpperCase();
 const code=String(observation?.code||'').trim().toUpperCase();
 if(observation?.halted===true || ['HALTED','STOPPED'].includes(status)
   || ['OWNER_HALT_ACTIVE','COMPUTER_HALTED','LOCAL_COMPUTE_DISABLED'].includes(code))return 'OWNER_STOPPED';
 if(String(observation?.permission||'').toUpperCase()==='DENIED'
   || ['DENIED','PERMISSION_DENIED'].includes(status)
   || ['PERMISSION_DENIED','COMPUTER_PERMISSION_DENIED','FORBIDDEN',
       'REMOTE_ACCESS_DISABLED_LOCALLY','COMPUTER_PERMISSION_REVOKED','COMPANION_PERMISSION_CHANGED'].includes(code))return 'PERMISSION_DENIED';
 if(observation?.online===false || status==='OFFLINE'
   || ['COMPUTER_OFFLINE','COMPUTER_DEVICE_OFFLINE','COMPUTER_ENGINE_OFFLINE',
       'COMPUTER_ENGINE_UNVERIFIED','COMPANION_SOVEREIGNTY_TIMEOUT','NETWORK_OFFLINE'].includes(code))return 'COMPUTER_OFFLINE';
 return ['FAILED','CANCELLED'].includes(status)?'COMPANION_CONTROL_BLOCKED':null;
}

// Optional only. "Prefer PC" must be explicit on the request AND the
// owner's separate Windows consent must be admitted by the executor.
// Without this flag MEL keeps its original primary cloud route.
export function shouldPreferOptionalCompanionCompute({
 prefer=false,disabled=false,voiceReply=false,personalProfileIntent=false,
 releaseSmoke=false,privateData=false,hasToolResults=false,parallel=false,
 hasActiveAdapter=false
}={}){
 return prefer===true && disabled!==true && !voiceReply && !personalProfileIntent
   && !releaseSmoke && !privateData && !hasToolResults && !parallel
   && !hasActiveAdapter;
}

export async function tryOptionalNativeCompanionFallback({
 env,messages,inferenceSettings=null,execute=null,asPrimary=false,timeoutMs=12000
}={}){
 if(!env?.DB && typeof execute!=='function')return null;
 if(!Array.isArray(messages)||messages.length<1)return null;
 // Keep the conversation transfer to the owner's computer explicitly bounded.
 const permitted=new Set(['system','assistant','user']);
 const bounded=messages.slice(-8).map(m=>({
   role:String(m?.role||'user'),content:String(m?.content||'')
 }));
 if(bounded.some(m=>!permitted.has(m.role)||m.content.length>12000))return null;
 if(bounded.reduce((sum,m)=>sum+m.content.length,0)>24000)return null;
 try{
   const boundedTimeout=Math.max(1000,Math.min(12000,Number(timeoutMs)||12000));
   const executor=execute||createCompanionSovereigntyExecutor(env,{
     timeoutMs:boundedTimeout,pollIntervalMs:250
   });
   const adapter=createCompanionLocalAiAdapter({execute:async input=>{
     const result=await executor(input);
     // A legacy command envelope may say SUCCEEDED while its payload carries
     // a device refusal. Never turn the accompanying stale text into success.
     if(companionBlockReason(result))
       return {ok:false,code:'COMPANION_CONTROL_BLOCKED'};
     return result;
   }});
   const answer=await adapter.invoke({input:bounded,context:{
     inference_settings:{
       temperature:inferenceSettings?.temperature??0.2,
       max_tokens:Math.min(512,Math.max(1,Number(inferenceSettings?.max_tokens)||360))
     }
   }});
   const text=String(answer?.text||'').trim();
   if(!text)return null;
   return {
     text,model:answer?.provenance?.model||'auto-local',
     provider:'local-companion-ai',task:'GENERAL',attempts:1,
     fallback_used:!asPrimary,optional_companion_used:true,
     companion_primary:asPrimary===true,
     tool_succeeded:true,finish_reason:null,truncated:false,
     provenance:{...answer.provenance,hardware_test_performed:false,evidence_scope:'INFERENCE_RESPONSE'},
     usage:null
   };
 }catch{return null;}
}
