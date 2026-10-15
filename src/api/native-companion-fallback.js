import {createCompanionSovereigntyExecutor} from '../portability/companion-sovereignty-executor.js';
import {createCompanionLocalAiAdapter} from '../portability/companion-local-ai-adapter.js';

// Only a last-resort candidate. The primary MEL route never waits for this
// unless its normal candidate/fallback models have already failed.
export async function tryOptionalNativeCompanionFallback({
 env,messages,inferenceSettings=null,execute=null
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
   const executor=execute||createCompanionSovereigntyExecutor(env,{
     timeoutMs:12000,pollIntervalMs:250
   });
   const adapter=createCompanionLocalAiAdapter({execute:executor});
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
     fallback_used:true,optional_companion_used:true,
     tool_succeeded:true,finish_reason:null,truncated:false,
     provenance:answer.provenance,
     usage:null
   };
 }catch{return null;}
}
