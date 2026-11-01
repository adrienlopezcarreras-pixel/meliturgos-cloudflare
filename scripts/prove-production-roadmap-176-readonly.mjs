// Exact-SHA, GET-only production roadmap audit. Never starts MAX or changes state.
import {DEFAULT_BASE,deriveParallelProof} from './prove-production-capability-inventory-readonly.mjs';
import {writeFile} from 'node:fs/promises';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

export function assessRoadmapResponse(body,expectedSha,{now=Date.now()}={}) {
  if(body?.ok!==true || !Array.isArray(body.phases) || !body.truth?.available)
    return {ok:false,code:'ROADMAP_PRODUCTION_TRUTH_UNAVAILABLE'};
  const ids=body.phases.flatMap(p=>(p.items||[]).map(i=>i.id));
  if(ids.length!==176||new Set(ids).size!==176 ||body.truth.total!==176)
    return {ok:false,code:'ROADMAP_PRODUCTION_INVENTORY_MISMATCH'};
  const allowed=new Set(['VERIFIED_LIVE','PARTIAL_LIVE','BROKEN','UNPROVEN','DECLARED']);
  const counts={VERIFIED_LIVE:0,PARTIAL_LIVE:0,BROKEN:0,UNPROVEN:0,DECLARED:0};
  const missing=[];
  for(const id of ids){
    const result=body.truth.items?.[id];
    if(!result||!allowed.has(result.truth))return {ok:false,code:'ROADMAP_PRODUCTION_ITEM_TRUTH_INVALID'};
    if(result.truth==='VERIFIED_LIVE'){
      // The runtime's label alone is not an audit receipt. Every contributing
      // proof must identify an executed source with a successful event.
      if(!Array.isArray(result.proofs)||result.proofs.length===0 ||
        result.proofs.some(p=>!['capability','computer','max-delivery'].includes(p?.kind)||
          typeof p.id!=='string'||!p.id.trim()||!(Number(p.ok)>0))){
        return {ok:false,code:'ROADMAP_PRODUCTION_VERIFIED_WITHOUT_RECEIPT'};
      }
      const proofAt=Date.parse(result.last_proof_at);
      if(!Number.isFinite(proofAt))return {ok:false,code:'ROADMAP_PRODUCTION_RECEIPT_DATE_MISSING'};
      // A valid old receipt is historical context, not current live coverage.
      if(proofAt < now-7*86400000 || proofAt > now+300000)
        return {ok:false,code:'ROADMAP_PRODUCTION_RECEIPT_OUTSIDE_WINDOW'};
    }
    counts[result.truth]++;
    if(result.truth!=='VERIFIED_LIVE')missing.push({id,status:result.truth});
  }
  if(Object.keys(body.truth.items).length!==176)return {ok:false,code:'ROADMAP_PRODUCTION_EXTRA_ITEM'};
  for(const key of Object.keys(counts)){
    if(body.truth.counts && body.truth.counts[key]!==counts[key])
      return {ok:false,code:'ROADMAP_PRODUCTION_COUNTS_MISMATCH'};
  }
  return {ok:true,code:'ROADMAP_PRODUCTION_176_TRUTH_MEASURED',deployed_sha:expectedSha,
    total:176,counts,verified_live:counts.VERIFIED_LIVE,
    coverage_percent:Math.round(counts.VERIFIED_LIVE*1000/176)/10,
    remaining:missing,production_truth_available:true,
    details_private:false,mutation_scope:'GET_ONLY'};
}
export async function measureRoadmapProduction({token,expectedSha,fetchImpl=fetch}={}){
  if(!token || !/^[0-9a-f]{40}$/.test(String(expectedSha||'')))
    return {ok:false,code:'ROADMAP_PRODUCTION_INPUT_INVALID'};
  const headers={'x-mel-release-smoke':'1','x-mel-parallel-proof':token,accept:'application/json'};
  async function get(path){
    const res=await fetchImpl(DEFAULT_BASE+path,{method:'GET',redirect:'error',headers,signal:AbortSignal.timeout(25000)});
    if(res.status!==200)throw Error('ROADMAP_GET_HTTP_'+res.status);
    return res.json();
  }
  let before,body,after;
  try{before=await get('/api/gen2/code/self-check');body=await get('/api/gen2/roadmap');after=await get('/api/gen2/code/self-check');}
  catch{return {ok:false,code:'ROADMAP_PRODUCTION_GET_FAILED'};}
  if([before,after].some(x=>x?.ok!==true||x.exact_deployment_identity_known!==true||
    String(x.deployed_sha).toLowerCase()!==expectedSha.toLowerCase()))
    return {ok:false,code:'ROADMAP_PRODUCTION_EXACT_SHA_NOT_PROVEN'};
  return assessRoadmapResponse(body,expectedSha);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const expectedSha=process.env.EXPECTED_SHA;
  const token=deriveParallelProof(process.env.PROOF_KEY_B64,expectedSha);
  const result=await measureRoadmapProduction({token,expectedSha});
  await writeFile('roadmap-production-176-proof.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ok:result.ok,code:result.code,verified_live:result.verified_live,total:result.total}));
  if(!result.ok)process.exitCode=1;
 }catch{console.error('ROADMAP_PRODUCTION_PROBE_FAILED');process.exitCode=1;}
}
