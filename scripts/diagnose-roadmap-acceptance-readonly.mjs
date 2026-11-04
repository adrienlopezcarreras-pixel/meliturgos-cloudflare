import {unstable_readConfig} from 'wrangler';
import {isAcceptedRoadmapCodeJob} from '../src/roadmap/roadmap-code-acceptance.js';
const config=unstable_readConfig({config:'wrangler.jsonc'});
const db=config.d1_databases.find(row=>row.binding==='DB').database_id;
async function read(sql){
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${db}/query`,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({sql,params:[]})});
 const b=await r.json(),v=b.result?.[0];
 if(!r.ok||b.success!==true||v?.success!==true||v.meta?.rows_written!==0)throw Error('READ_ONLY_PROOF_UNAVAILABLE');
 return v.results;
}
const sql="SELECT id,created_at,updated_at,status,requested_by,\n      json_object('roadmap_id',json_extract(optional_context,'$.roadmap_id'),\n        'roadmap_contract_revision',json_extract(optional_context,'$.roadmap_contract_revision'),\n        'source',json_extract(optional_context,'$.source')) AS optional_context,\n      (SELECT json_group_array(json_object('path',json_extract(f.value,'$.path')))\n        FROM json_each(CASE WHEN json_valid(dev_jobs.files_json) THEN dev_jobs.files_json ELSE '[]' END) f) AS files_json,\n      json_object('roadmap_code_acceptance',json_extract(result_json,'$.roadmap_code_acceptance'),\n        'verify_existing',json_object('status',json_extract(result_json,'$.verify_existing.status'),\n          'candidate_sha',json_extract(result_json,'$.verify_existing.candidate_sha')),\n        'autonomy_completion',json_object('status',json_extract(result_json,'$.autonomy_completion.status'),\n          'candidate_sha',json_extract(result_json,'$.autonomy_completion.candidate_sha'),\n          'candidate_branch',json_extract(result_json,'$.autonomy_completion.candidate_branch'),\n          'ci',json_extract(result_json,'$.autonomy_completion.ci'),\n          'mel_implementation',json_object(\n            'verified',json(COALESCE(result_json -> '$.autonomy_completion.mel_implementation.verified','null')),\n            'providers_attempted',json_extract(result_json,'$.autonomy_completion.mel_implementation.providers_attempted')))) AS result_json\n      FROM dev_jobs WHERE requested_by='mel-autonomy' AND status='COMPLETED'\n        AND json_valid(optional_context)\n        AND CASE WHEN json_valid(result_json) THEN json_type(result_json,'$.roadmap_code_acceptance')='object' ELSE 0 END\n      ORDER BY created_at ASC,id ASC";
const raw=await read(sql);
const epoch=Number((await read("SELECT last_seen FROM dev_bridge_state WHERE bridge_id='activity-list-epoch' LIMIT 1"))[0]?.last_seen||0);
const rows=raw.map(row=>{for(const key of ['optional_context','files_json','result_json'])row[key]=JSON.parse(row[key]);return row;});
const accepted=rows.filter(isAcceptedRoadmapCodeJob);
console.log(JSON.stringify({rows_written:0,receipt_count:rows.length,accepted_count:accepted.length,accepted_before_activity_reset:accepted.filter(row=>row.created_at<epoch).map(row=>row.optional_context.roadmap_id),accepted_after_activity_reset:accepted.filter(row=>row.created_at>=epoch).map(row=>row.optional_context.roadmap_id)}));
const handoffs=await read(`SELECT json_extract(i.value,'$.handoff.status') AS handoff_status,
 json_extract(i.value,'$.handoff.closed') AS closed,
 json_extract(i.value,'$.handoff.retryable') AS retryable,
 CASE WHEN json_extract(i.value,'$.handoff.code') NOT GLOB '*[^A-Z0-9_]*' THEN json_extract(i.value,'$.handoff.code') ELSE 'OTHER_OR_NONE' END AS handoff_code,
 CASE WHEN length(COALESCE(json_extract(i.value,'$.handoff.teacher_request_id'),''))>0 THEN 1 ELSE 0 END AS has_teacher_request,
 j.status AS canonical_job_status,
 json_extract(j.optional_context,'$.roadmap_id') AS roadmap_id,
 json_extract(j.optional_context,'$.roadmap_contract_revision') AS contract_revision,
 json_extract(j.result_json,'$.teacher_bridge.status') AS teacher_status,
 json_extract(j.result_json,'$.teacher_bridge.review.verdict') AS verdict,
 json_extract(j.result_json,'$.autonomy_completion.status') AS completion_status,
 json_extract(j.result_json,'$.autonomy_completion.ci.conclusion') AS ci_conclusion,
 json_extract(i.value,'$.owner_decision.decided_at') AS owner_decided_at
 FROM capability_watch_state s,json_each(s.state_json,'$.items') i
 LEFT JOIN dev_jobs j ON j.id=json_extract(i.value,'$.handoff.job_id')
 WHERE s.id='ecosystem-discoveries-canonical' AND json_type(i.value,'$.handoff')='object' LIMIT 50`);
console.log(JSON.stringify({schema:'mel.handoff-diagnostic-readonly/v1',rows_written:0,handoffs:handoffs.map(row=>({...row,accepted_equivalent:accepted.some(job=>job.optional_context.roadmap_id===row.roadmap_id && job.optional_context.roadmap_contract_revision===row.contract_revision)}))}));
const council=await read(`SELECT s.status AS decision,json_extract(s.metadata_json,'$.attempts') AS attempts,
 CASE WHEN json_extract(r.value,'$.model') IN ('@cf/openai/gpt-oss-120b','@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/google/gemma-4-26b-a4b-it','@cf/nvidia/nemotron-3-120b-a12b') THEN json_extract(r.value,'$.model') ELSE 'OTHER_MODEL' END AS model,
 json_extract(r.value,'$.verdict') AS verdict,
 CASE WHEN json_extract(r.value,'$.error') IS NULL THEN 'NONE'
 WHEN lower(json_extract(r.value,'$.error')) LIKE '%quota%' OR lower(json_extract(r.value,'$.error')) LIKE '%neuron%' THEN 'QUOTA_RELATED'
 WHEN lower(json_extract(r.value,'$.error')) LIKE '%timeout%' OR lower(json_extract(r.value,'$.error')) LIKE '%deadline%' THEN 'TIMEOUT_RELATED'
 WHEN lower(json_extract(r.value,'$.error')) LIKE '%unparseable%' THEN 'UNPARSEABLE_REVIEW'
 ELSE 'OTHER_ERROR' END AS failure_class
 FROM dev_bridge_state s,json_each(s.metadata_json,'$.reviews') r
 WHERE s.bridge_id='council-review:3c1fb505f1b753dcfd2844698ce9b402064a44e6' LIMIT 10`);
console.log(JSON.stringify({schema:'mel.council-review-readonly/v1',rows_written:0,council}));
const objections=await read(`SELECT json_extract(r.value,'$.blocking') AS blocking FROM dev_bridge_state s,json_each(s.metadata_json,'$.reviews') r WHERE s.bridge_id='council-review:3c1fb505f1b753dcfd2844698ce9b402064a44e6' AND json_extract(r.value,'$.model')='@cf/nvidia/nemotron-3-120b-a12b' AND json_extract(r.value,'$.verdict')='REJECT' LIMIT 1`);
console.log(JSON.stringify({schema:'mel.public-code-review-objections/v1',rows_written:0,objections}));
