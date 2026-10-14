// Offline-by-default SHA-256 audit of the two PRIVATE GitHub draft Release assets.
// Live mode uses authenticated GET only; no write/activation/GPU/deployment.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export const REPO='adrienlopezcarreras-pixel/meliturgos-cloudflare';
export const TAG='mel-lora-kaggle-635c4786b39b-c000';
export const SOURCE='635c4786b39b9c3a5458126d64ec7bb726a282e7';
export const ASSETS={
  'mel-lora-bundle.tar.gz':{size:12629356,sha256:'1e15f90e19ab03c5067a543ec78b8bee9f3e29c25f23697fff3a98fad0c801b0'},
  'checkpoint-draft-proof.json':{size:364,sha256:'b84cd895bd1def9303c7677da16bb57e6b95fbc101a0fed5b3b95ba2a5ab3a8f'},
};
const API='https://api.github.com/repos/'+REPO;
const API_HEADERS={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const allowedRedirect=(url)=>{
  try{
    const parsed=new URL(url);
    return parsed.protocol==='https:' &&
      (parsed.hostname==='release-assets.githubusercontent.com' ||
       parsed.hostname==='objects.githubusercontent.com');
  }catch{return false;}
};

export async function verifyByteStream(response,expected){
  if(!response?.ok || !response.body ||
      /application\/json/i.test(response.headers?.get('content-type')||'')){
    return {ok:false,code:'DRAFT_ASSET_BINARY_DOWNLOAD_FAILED'};
  }
  const digest=createHash('sha256');
  let bytes=0;
  try{
    for await (const block of response.body){
      bytes+=block.byteLength;
      if(bytes>expected.size)return {ok:false,code:'DRAFT_ASSET_SIZE_OVERFLOW'};
      digest.update(block);
    }
  }catch{return {ok:false,code:'DRAFT_ASSET_STREAM_FAILED'};}
  if(bytes!==expected.size || digest.digest('hex')!==expected.sha256){
    return {ok:false,code:'DRAFT_ASSET_SHA256_OR_SIZE_MISMATCH'};
  }
  return {ok:true,code:'DRAFT_ASSET_BYTES_VERIFIED',bytes};
}

export async function hashGithubAsset({asset,token,fetchImpl=fetch}){
  const expected=ASSETS[asset?.name];
  if(!token || !expected || !Number.isSafeInteger(asset?.id) ||
      asset.id<=0 || asset.size!==expected.size){
    return {ok:false,code:'DRAFT_ASSET_METADATA_INVALID'};
  }
  let response;
  try{
    response=await fetchImpl(API+'/releases/assets/'+asset.id,{
      method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000),
      headers:{...API_HEADERS,Authorization:'Bearer '+token,
        Accept:'application/octet-stream'},
    });
    if([302,303,307,308].includes(response.status)){
      const target=response.headers?.get('location');
      if(!allowedRedirect(target))return {ok:false,code:'DRAFT_ASSET_REDIRECT_REJECTED'};
      // Do not send the GitHub token to the signed asset CDN.
      response=await fetchImpl(target,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(60000),
      });
    }
  }catch{return {ok:false,code:'DRAFT_ASSET_FETCH_FAILED'};}
  const hash=await verifyByteStream(response,expected);
  return hash.ok ? {...hash,name:asset.name} : hash;
}

export async function auditC000DraftAssets({token,fetchImpl=fetch}={}){
  if(!token)return {ok:false,code:'DRAFT_ASSET_TOKEN_MISSING'};
  let draft=null,complete=false,seen=0;
  for(let page=1;page<=5;page++){
    let response;
    try{
      response=await fetchImpl(API+'/releases?per_page=100&page='+page,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{...API_HEADERS,Authorization:'Bearer '+token},
      });
    }catch{return {ok:false,code:'DRAFT_RELEASE_LIST_NETWORK_FAILED'};}
    if(!response.ok)return {ok:false,code:'DRAFT_RELEASE_LIST_DENIED'};
    let rows;
    try{rows=await response.json();}catch{return {ok:false,code:'DRAFT_RELEASE_LIST_INVALID'};}
    if(!Array.isArray(rows))return {ok:false,code:'DRAFT_RELEASE_LIST_INVALID'};
    for(const row of rows){
      if(row?.tag_name===TAG){
        seen++;
        draft=row;
      }
    }
    if(rows.length<100){complete=true;break;}
  }
  if(!complete||seen!==1)return {ok:false,code:'DRAFT_RELEASE_MISSING_DUPLICATE_OR_INCOMPLETE'};
  if(draft.draft!==true||draft.tag_name!==TAG||
      draft.target_commitish!==SOURCE||
      !Array.isArray(draft.assets)||draft.assets.length!==2||
      new Set(draft.assets.map(a=>a?.name)).size!==2){
    return {ok:false,code:'DRAFT_RELEASE_PROVENANCE_INVALID'};
  }
  for(const asset of draft.assets){
    const result=await hashGithubAsset({asset,token,fetchImpl});
    if(!result.ok)return result;
  }
  return {ok:true,code:'C000_DRAFT_RELEASE_BYTE_EXACT_NO_PROMOTION',assets:2,activated:false};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const proof=await auditC000DraftAssets({token:process.env.MEL_LORA_RELEASE_TOKEN});
  console.log(proof.code);
  if(!proof.ok)process.exitCode=1;
}
