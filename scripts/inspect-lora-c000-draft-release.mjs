// MEL LoRA c000: read-only release listing proof.
// Draft releases can return HTTP 404 from GET /releases/tags/{tag}, even
// when GET /releases shows the authenticated draft. Never print credentials.
export const C000_TAG='mel-lora-kaggle-635c4786b39b-c000';
export const C000_SHA='635c4786b39b9c3a5458126d64ec7bb726a282e7';
const ASSETS=new Set(['mel-lora-bundle.tar.gz','checkpoint-draft-proof.json']);

export async function inspectC000DraftRelease({
  token,
  repo='adrienlopezcarreras-pixel/meliturgos-cloudflare',
  mode='verify-draft',
  fetchImpl=fetch,
}={}){
  if(!token || repo!=='adrienlopezcarreras-pixel/meliturgos-cloudflare' ||
      !['require-absent','verify-draft'].includes(mode)){
    return {ok:false,code:'CHECKPOINT_DRAFT_INSPECT_INPUT_INVALID'};
  }
  const matching=[];
  let complete=false;
  for(let page=1;page<=5;page++){
    let response;
    try{
      response=await fetchImpl(
        'https://api.github.com/repos/'+repo+'/releases?per_page=100&page='+page,
        {method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
          headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
            'X-GitHub-Api-Version':'2022-11-28'}},
      );
    }catch{return {ok:false,code:'CHECKPOINT_DRAFT_LIST_NETWORK_FAILED'};}
    if(!response.ok)return {ok:false,code:'CHECKPOINT_DRAFT_LIST_ACCESS_FAILED'};
    let items;
    try{items=await response.json();}catch{return {ok:false,code:'CHECKPOINT_DRAFT_LIST_JSON_INVALID'};}
    if(!Array.isArray(items))return {ok:false,code:'CHECKPOINT_DRAFT_LIST_RESPONSE_INVALID'};
    matching.push(...items.filter(item=>item?.tag_name===C000_TAG));
    if(items.length<100){complete=true;break;}
  }
  if(!complete)return {ok:false,code:'CHECKPOINT_DRAFT_LIST_INCOMPLETE'};
  if(matching.length>1)return {ok:false,code:'CHECKPOINT_DRAFT_DUPLICATE_TAG'};
  if(mode==='require-absent'){
    return matching.length===0
      ? {ok:true,code:'CHECKPOINT_DRAFT_ABSENT_VERIFIED'}
      : {ok:false,code:'CHECKPOINT_RELEASE_ALREADY_EXISTS_NO_CLOBBER'};
  }
  if(matching.length===0)return {ok:false,code:'CHECKPOINT_DRAFT_NOT_FOUND'};
  const row=matching[0],assets=Array.isArray(row?.assets)?row.assets:[];
  const valid=row.draft===true&&row.tag_name===C000_TAG&&
    row.target_commitish===C000_SHA&&assets.length===2&&
    new Set(assets.map(a=>a?.name)).size===2&&
    assets.every(a=>ASSETS.has(a?.name)&&Number.isSafeInteger(a?.size)&&a.size>0);
  return valid
    ? {ok:true,code:'CHECKPOINT_DRAFT_RELEASE_AND_ASSETS_VERIFIED_NO_PROMOTION'}
    : {ok:false,code:'CHECKPOINT_DRAFT_POSTCREATE_PROOF_FAILED'};
}

if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const mode=process.argv[2];
  const result=await inspectC000DraftRelease({token:process.env.GH_TOKEN,mode});
  console.log(result.code);
  if(!result.ok)process.exitCode=1;
}
