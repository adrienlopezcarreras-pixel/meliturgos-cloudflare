/**
 * Preview-only encrypted GitHub mirror. Its input is the signed preview
 * code-sync response; it never processes production relay jobs or buckets.
 */
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PREVIEW_MIRROR_BRANCH='shardvault-preview-mirror';
function fail(code){throw new Error(code);}
export function validatePreviewContext(env,config){
  const sha=String(env.GITHUB_SHA||'');
  const repo=String(env.GITHUB_REPOSITORY||'');
  const bucket=String(env.MEL_PREVIEW_R2_BUCKET||'');
  const prod=config?.r2_buckets?.find(x=>x.binding==='MEDIA_BUCKET')?.bucket_name;
  const preview=config?.env?.preview?.r2_buckets?.find(x=>x.binding==='MEDIA_BUCKET')?.bucket_name;
  const prodD1=config?.d1_databases?.find(x=>x.binding==='DB')?.database_id;
  const previewD1=config?.env?.preview?.d1_databases?.find(x=>x.binding==='DB')?.database_id;
  if(env.GITHUB_REF!=='refs/heads/candidate/mel-clean-autonomy'
    ||env.GITHUB_REF_NAME!=='candidate/mel-clean-autonomy')fail('PREVIEW_MIRROR_CANDIDATE_ONLY');
  if(!/^[a-f0-9]{40}$/.test(sha))fail('PREVIEW_MIRROR_SHA_INVALID');
  if(repo!=='adrienlopezcarreras-pixel/meliturgos-cloudflare')fail('PREVIEW_MIRROR_REPOSITORY_MISMATCH');
  if(config?.env?.preview?.vars?.MEL_RUNTIME_ENV!=='preview'
    ||config?.env?.preview?.vars?.MEL_PREVIEW_ISOLATED!=='true')fail('PREVIEW_MIRROR_ISOLATION_UNPROVEN');
  if(!bucket||bucket!==preview||bucket===prod
    ||!/^meliturgos-preview-[a-z0-9-]+$/.test(bucket))fail('PREVIEW_MIRROR_BUCKET_ISOLATION_UNPROVEN');
  if(!previewD1||!prodD1||previewD1===prodD1)fail('PREVIEW_MIRROR_D1_ISOLATION_UNPROVEN');
  const shardBytes=Number(env.MEL_CRITICAL_CODE_SHARD_BYTES);
  if(!Number.isSafeInteger(shardBytes)||shardBytes<65536||shardBytes>8388608)fail('PREVIEW_MIRROR_BYTES_INVALID');
  return {sha,repo,bucket,shardBytes};
}
export function previewMirrorPending(d,ctx){
  const e=d?.external||{};
  if(d?.status!=='RETRY_TARGETS'||e.reason!=='GITHUB_CODE_MIRROR_PENDING')return null;
  if(d?.ok!==true||d.sha!==ctx.sha||e.relay_pending!==true
    ||!/^[-_a-zA-Z0-9]{8,128}$/.test(String(e.relay_job_id||''))
    ||Number(e.completed_shards)!==6||Number(e.pending_shards)!==1
    ||Number(e.target_count)!==7)fail('PREVIEW_MIRROR_PENDING_PROOF_INVALID');
  const object='code-'+ctx.sha.slice(0,12)+'-shard-06-github';
  return {
    key:'shardvault/github-code-mirror-staging/'+ctx.repo.replace('/','__')+'/'+ctx.sha+'/'+object+'.bin',
    path:'shardvault-code/'+ctx.sha+'/'+object+'.bin',
  };
}
async function api(url,token,method='GET',data=null){
  const response=await fetch(url,{method,headers:{
    authorization:'Bearer '+token,accept:'application/vnd.github+json',
    'content-type':'application/json','x-github-api-version':'2022-11-28',
    'user-agent':'MEL-preview-code-mirror'
  },...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(30000)});
  const body=await response.json().catch(()=>null);
  return {status:response.status,body};
}
export async function publishPreviewMirror(ctx,pending,bytes,token,request=api){
  if(!token||token.length<20)fail('PREVIEW_MIRROR_GITHUB_TOKEN_REQUIRED');
  if(!(bytes instanceof Uint8Array)||bytes.length!==ctx.shardBytes)fail('PREVIEW_MIRROR_FRAGMENT_SIZE_INVALID');
  const hash=createHash('sha256').update(bytes).digest('hex');
  const base='https://api.github.com/repos/'+ctx.repo+'/';
  const ref=await request(base+'git/ref/heads/'+PREVIEW_MIRROR_BRANCH,token);
  if(ref.status===404){
    const c=await request(base+'git/refs',token,'POST',
      {ref:'refs/heads/'+PREVIEW_MIRROR_BRANCH,sha:ctx.sha});
    if(c.status!==201&&c.status!==422)fail('PREVIEW_MIRROR_BRANCH_CREATION_FAILED');
  }else if(ref.status!==200)fail('PREVIEW_MIRROR_BRANCH_READ_FAILED');
  const url=base+'contents/'+pending.path;
  const existing=await request(url+'?ref='+PREVIEW_MIRROR_BRANCH,token);
  if(existing.status===200){
    if(existing.body?.encoding!=='base64')fail('PREVIEW_MIRROR_EXISTING_NOT_VERIFIABLE');
    const prior=Buffer.from(String(existing.body.content||'').replace(/\s/g,''),'base64');
    if(prior.length!==bytes.length||createHash('sha256').update(prior).digest('hex')!==hash)
      fail('PREVIEW_MIRROR_EXISTING_FRAGMENT_DIFFERENT');
    return {ok:true,status:'EXISTING_EXACT_FRAGMENT_VERIFIED'};
  }
  if(existing.status!==404)fail('PREVIEW_MIRROR_EXISTING_READ_FAILED');
  const written=await request(url,token,'PUT',{
    message:'Isolated encrypted preview shard '+ctx.sha.slice(0,12),
    branch:PREVIEW_MIRROR_BRANCH,content:Buffer.from(bytes).toString('base64')
  });
  if(written.status!==201||!/^[0-9a-f]{40}$/.test(String(written.body?.commit?.sha||'')))
    fail('PREVIEW_MIRROR_GITHUB_WRITE_UNPROVEN');
  const verify=await request(url+'?ref='+PREVIEW_MIRROR_BRANCH,token);
  if(verify.status!==200||verify.body?.encoding!=='base64')fail('PREVIEW_MIRROR_READBACK_FAILED');
  const got=Buffer.from(String(verify.body.content||'').replace(/\s/g,''),'base64');
  if(got.length!==bytes.length||createHash('sha256').update(got).digest('hex')!==hash)
    fail('PREVIEW_MIRROR_HASH_MISMATCH');
  return {ok:true,status:'EXACT_FRAGMENT_PUBLISHED_VERIFIED'};
}
async function main(){
  const env=process.env;
  const cfg=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  const context=validatePreviewContext(env,cfg);
  const d=JSON.parse(await readFile('shardvault-code-sync.json','utf8'));
  const pending=previewMirrorPending(d,context);
  if(!pending){console.log('PREVIEW_MIRROR_NO_PENDING_JOB');return;}
  const directory=await mkdtemp(join(tmpdir(),'mel-preview-mirror-'));
  try{
    const file=join(directory,'encrypted-shard.bin');
    const r=spawnSync('npx',['wrangler','r2','object','get',
      context.bucket+'/'+pending.key,'--file',file,'--remote'],{
      env,cwd:process.cwd(),encoding:'utf8',timeout:90000,maxBuffer:1048576
    });
    if(r.status!==0)fail('PREVIEW_MIRROR_ISOLATED_R2_READ_FAILED');
    const bytes=new Uint8Array(await readFile(file));
    const result=await publishPreviewMirror(context,pending,bytes,String(env.GITHUB_TOKEN||''));
    console.log('PREVIEW_MIRROR_'+result.status);
  }finally{await rm(directory,{force:true,recursive:true});}
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(error=>{console.error(String(error?.message||'PREVIEW_MIRROR_FAILED'));process.exitCode=1;});
}
