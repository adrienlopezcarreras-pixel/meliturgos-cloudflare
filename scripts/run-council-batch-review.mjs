#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {planCouncilDiffBatches} from '../src/evolution/council-diff-batches.js';
const [source,logPath]=process.argv.slice(2);
const head=String(process.env.MEL_COUNCIL_HEAD_SHA||'').toLowerCase();
const base=String(process.env.MEL_COUNCIL_BASE_SHA||'').toLowerCase();
const token=process.env.MEL_COUNCIL_OIDC_TOKEN||'';
const url='https://meliturgos.adrien-lopezcarreras.workers.dev/api/internal/council-review';
if(!source||!logPath||!/^[a-f0-9]{40}$/.test(head)||!/^[a-f0-9]{40}$/.test(base)
    ||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN||!process.env.ACTIONS_ID_TOKEN_REQUEST_URL)throw Error('COUNCIL_BATCH_RUNNER_NOT_CONFIGURED');
const raw=readFileSync(source);
const diff=new TextDecoder('utf-8',{fatal:true}).decode(raw);
const log=readFileSync(logPath,'utf8').slice(0,15000);
const planned=planCouncilDiffBatches(diff);
if(!planned.ok||planned.batchCount<2)throw Error(planned.code||'COUNCIL_BATCH_EXPECTED');
const hash=value=>createHash('sha256').update(value).digest('hex');
const root=hash(raw);
const common={head,base,root_sha256:root,batch_count:planned.batchCount,
  total_bytes:planned.totalBytes,file_count:planned.fileCount};
async function currentOidcToken(){
  const requestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(!requestUrl||!requestToken)throw Error('COUNCIL_BATCH_FRESH_OIDC_REQUIRED');
  const issuerUrl=new URL(requestUrl);
  if(issuerUrl.protocol!=='https:')throw Error('COUNCIL_BATCH_OIDC_URL_INVALID');
  issuerUrl.searchParams.set('audience','meliturgos-worker');
  const response=await fetch(issuerUrl,{
    method:'GET',redirect:'error',
    headers:{authorization:'bearer '+requestToken},
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw Error('COUNCIL_BATCH_OIDC_FETCH_FAILED');
  const body=await response.json();
  if(typeof body?.value!=='string'||body.value.length<100)
    throw Error('COUNCIL_BATCH_OIDC_EMPTY');
  return body.value;
}
async function post(data){
  const freshToken=await currentOidcToken();
  const response=await fetch(url,{method:'POST',redirect:'manual',
    headers:{'x-mel-github-oidc':freshToken,'content-type':'application/json'},
    body:JSON.stringify(data),signal:AbortSignal.timeout(300000)});
  if(response.status!==200)throw Error('COUNCIL_BATCH_HTTP_'+response.status);
  return response.json();
}
for(const batch of planned.batches){
  const data=await post({...common,mode:'batch',batch_index:batch.number,
    batch_sha256:hash(batch.diff),diff:batch.diff,log});
  if(data?.ok!==true||data.batch_index!==batch.number||data.head!==head
      ||data.root_sha256!==root||data.batch_decision!=='APPROVED'
      ||data.decision!=='PENDING_ALL_BATCH_REVIEWS')
    throw Error('COUNCIL_BATCH_NOT_APPROVED_'+batch.number);
  process.stderr.write('Council batch '+batch.number+'/'+planned.batchCount+
    ' approved independently; overall approval still pending.\n');
}
const result=await post({...common,mode:'final',log});
if(result?.ok!==true||result?.decision!=='APPROVED'||result?.complete_review!==true
    ||result.head!==head||result.root_sha256!==root
    ||result.batch_count!==planned.batchCount)throw Error('COUNCIL_FINAL_REVIEW_NOT_APPROVED');
process.stdout.write(JSON.stringify({ok:true,decision:'APPROVED',head,
  root_sha256:root,reviewed_file_count:planned.fileCount,
  reviewed_batch_count:planned.batchCount,complete_review:true}));
