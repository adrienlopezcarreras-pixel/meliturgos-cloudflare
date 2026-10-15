// Optional GPU compute routing. No public host scanning and no direct URL execution.
// Providers must be pre-registered by the owner with an explicit usage grant.
const allowedKinds=new Set(['owner-node','volunteer-node','provider-free-api']);
const allowedGrants=new Set(['owner-control','volunteer-consent','service-permission']);
function positiveFinite(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0;}
export function eligibleAuthorizedGpuNodes(nodes=[],{now=Date.now(),classification='public'}={}){
 if(!Array.isArray(nodes)||classification!=='public')return[];
 return nodes.filter(node=>
   node&&typeof node.id==='string'&&/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(node.id)&&
   allowedKinds.has(node.kind)&&allowedGrants.has(node.permission_basis)&&
   node.permission_verified===true&&node.free_tier_verified===true&&
   node.cost_hard_limit_usd===0&&node.online===true&&
   positiveFinite(node.last_checked_at)&&node.last_checked_at<=now&&
   now-node.last_checked_at<=60000&&positiveFinite(node.latency_ms)&&node.latency_ms<=15000
 ).sort((a,b)=>a.latency_ms-b.latency_ms).map(node=>({
   id:node.id,kind:node.kind,latency_ms:node.latency_ms
 }));
}
export async function invokeWithOptionalRemoteGpu({
 enabled=false,ownerConsent=false,classification='private',nodes=[],request,
 invokeRemote,fallback,now=Date.now(),timeoutMs=4000
}={}){
 if(typeof fallback!=='function')throw new TypeError('PRIMARY_MEL_FALLBACK_REQUIRED');
 const primary=()=>fallback(request);
 if(enabled!==true||ownerConsent!==true||typeof invokeRemote!=='function')
   return primary();
 const candidates=eligibleAuthorizedGpuNodes(nodes,{now,classification});
 for(const node of candidates){
   try{
     const abort=new AbortController();
     const deadline=Math.max(5,Math.min(12000,Number.isFinite(timeoutMs)?timeoutMs:4000));
     let timer;
     let result;
     try{
       result=await Promise.race([
         Promise.resolve().then(()=>invokeRemote({nodeId:node.id,request,signal:abort.signal})),
         new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('REMOTE_GPU_TIMEOUT')),deadline);})
       ]);
     }finally{clearTimeout(timer);abort.abort();}
     // No remote answer is trusted without a successful, usable result.
     if(result?.ok===true&&typeof result.text==='string'&&result.text.trim()&&result.text.length<=32000)
       return {...result,source:'authorized-remote-gpu',node_id:node.id};
   }catch{}
 }
 return primary();
}
