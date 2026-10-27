// Manual owner-only diagnostic runner. Production JSON remains in this process;
// the artifact contains only its digest and the reproduced error/progress.
import { createHash,randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile,unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { runAutonomyRuntimeTick as runFixed } from '../src/evolution/autonomy-runtime-core.js';
export const FOUNDER_JOB_ID='mel-autonomy-mel-founder-01-e1793054144390-1';
const BEFORE_SHA='58fbda579223a3e1b47d18715a940110e3ed47da';
const SHA='a'.repeat(40);

export async function replayFounderSnapshot(row, run) {
  if(row?.id!==FOUNDER_JOB_ID || !row.result_json)throw Error('FOUNDER_SNAPSHOT_REQUIRED');
  const parse=v=>typeof v==='string'?JSON.parse(v):v;
  const repository=new D1DevJobRepository(null,{memoryStore:new Map()});
  await repository.create({id:row.id,goal:row.goal||'[MEL-FOUNDER-01] existing repair',requested_by:'mel-autonomy',optional_context:{...parse(row.optional_context),roadmap_id:'MEL-FOUNDER-01'}});
  // Replay the reported post-repair state, not the later owner cancellation.
  // Every persisted result field is retained; no production status is changed.
  await repository.update(row.id,{status:'TEACHER_APPROVED',result_json:parse(row.result_json),plan_json:parse(row.plan_json)||null,patch_json:parse(row.patch_json)||null,files_json:parse(row.files_json)||[],tests_json:parse(row.tests_json)||[]});
  const env={MEL_GITHUB_REPOSITORY:'fixture/repo',MEL_GITHUB_BRANCH:'candidate/mel-clean-autonomy',MEL_TEACHER_BRANCH:'candidate/mel-clean-autonomy',AI:{run:async()=>({response:'mock provider, no external inference'})}};
  const fetchImpl=async url=>String(url).includes('/commits/')?Response.json({sha:SHA}):new Response('fixture unavailable',{status:403});
  return run(env,{repository,fetchImpl,roadmap:[{id:'MEL-FOUNDER-01',title:'Replay existing repair',status:'IN_PROGRESS',priority:'P0'}],onlyJobId:row.id,epochMs:0});
}

async function main(){
  const {unstable_readConfig}=await import('wrangler');
  const config=unstable_readConfig({config:'wrangler.jsonc'});
  const database=config.d1_databases?.find(row=>row.binding==='DB')?.database_id;
  const account=process.env.CLOUDFLARE_ACCOUNT_ID;
  const token=process.env.CLOUDFLARE_API_TOKEN;
  if(!account||!token||!database)throw Error('D1_ACCESS_UNAVAILABLE');
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:'SELECT id,goal,optional_context,result_json,plan_json,patch_json,files_json,tests_json FROM dev_jobs WHERE id=? LIMIT 1',params:[FOUNDER_JOB_ID]})});
  if(!response.ok)throw Error('D1_SNAPSHOT_READ_FAILED');
  const body=await response.json();const result=body?.result?.[0];
  if(body.success!==true||result?.success!==true||result?.meta?.rows_written!==0||result.results?.length!==1)throw Error('D1_SNAPSHOT_READ_UNPROVEN');
  const row=result.results[0];
  const source=execFileSync('git',['show',`${BEFORE_SHA}:src/evolution/autonomy-runtime-core.js`],{encoding:'utf8',maxBuffer:2*1024*1024});
  const temporary=new URL(`../src/evolution/.founder-before-${randomUUID()}.js`,import.meta.url);
  let before=null;
  try {
    await writeFile(temporary,source);
    const module=await import(temporary.href);
    try{await replayFounderSnapshot(row,module.runAutonomyRuntimeTick);}catch(error){before={name:['TypeError','SyntaxError','Error'].includes(error.name)?error.name:'Error',message:error.message==="Cannot read properties of undefined (reading 'length')"?error.message:'UNEXPECTED_REPLAY_ERROR',location:String(error.stack||'').split('\n').find(line=>line.includes('.founder-before-'))?.trim()||null};}
  }finally{await unlink(temporary).catch(()=>{});}
  const fixed=await replayFounderSnapshot(row,runFixed);
  const proof={schema:'mel.founder-runtime-reproduction/v1',job_id:row.id,before_source_sha:BEFORE_SHA,result_json_sha256:createHash('sha256').update(row.result_json).digest('hex'),result_json_bytes:Buffer.byteLength(row.result_json),production_rows_written:0,replay_status:'TEACHER_APPROVED',replay_scope:'real-result-json-with-local-mocked-dependencies',before,after:{ok:fixed.ok===true,job_id:fixed.job?.id||null,progress_returned:Boolean(fixed.progress),candidate_ci_repaired_array:Array.isArray(fixed.candidate_ci?.repaired)},external_inference_calls:0};
  proof.ok=before?.name==='TypeError'&&before?.message==="Cannot read properties of undefined (reading 'length')"&&proof.after.ok&&proof.after.progress_returned&&proof.after.candidate_ci_repaired_array;
  await writeFile('founder-runtime-reproduction.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
  if(!proof.ok)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('FOUNDER_REPRODUCTION_FAILED: no production snapshot content logged');process.exitCode=1;});
