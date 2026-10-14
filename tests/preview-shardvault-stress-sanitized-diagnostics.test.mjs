import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync('.github/workflows/deploy-candidate-preview.yml','utf8');
const start=workflow.indexOf('      - name: Stress preview UI API and recovery paths');
const end=workflow.indexOf('      - name: Upload ShardVault reconstruction and stress evidence',start);
const section=workflow.slice(start,end);
const marker='HTTP_CODE="${HTTP_CODE}" CURL_EXIT="${CURL_EXIT}" PATTERN="${pattern}" ATTEMPT="${reconstruction_attempt}" node - <<\'NODE\'';
const offset=section.indexOf(marker);
assert.ok(offset>=0,'sanitized failure reporter exists');
const beginning=section.indexOf('\n',offset)+1;
const finish=section.indexOf('\n          NODE',beginning);
assert.ok(finish>beginning,'reporter closes with safe quoted heredoc');
const reporter=section.slice(beginning,finish).split('\n').map(x=>x.replace(/^ {10}/,'')).join('\n');

function runDiagnostic(data){
 const root=mkdtempSync(join(tmpdir(),'mel-stress-safe-'));
 try{
   writeFileSync(join(root,'stress-reconstruct.json'),JSON.stringify(data));
   const response=spawnSync('node',['-e',reporter],{
     cwd:root,encoding:'utf8',
     env:{...process.env,HTTP_CODE:'409',CURL_EXIT:'0',ATTEMPT:'2',PATTERN:'[6,0,2]'},
   });
   assert.equal(response.status,0,response.stderr);
   return {
     record:JSON.parse(readFileSync(join(root,'stress-reconstruction-failures.ndjson'),'utf8').trim()),
     stdout:response.stdout,
   };
 }finally{rmSync(root,{recursive:true,force:true});}
}

test('sanitized stress 409 diagnostic reports missing shard and never a URL or secret',()=>{
 const {record,stdout}=runDiagnostic({
   ok:false,status:'CODE_RECONSTRUCTION_SHARDS_INSUFFICIENT',
   healthy_shards:3,required_shards:4,
   errors:[{index:5,endpoint_id:'secret-host',error:'READ_user-secret-via-https://sensitive.example?t=credential'},
     {index:6,endpoint_id:'github-actions-code-mirror',error:'READ_github-actions-code-mirror_404'}],
 });
 assert.equal(record.http,409);
 assert.equal(record.curl_exit,0);
 assert.equal(record.attempt,2);
 assert.deepEqual(record.pattern,[6,0,2]);
 assert.equal(record.status,'CODE_RECONSTRUCTION_SHARDS_INSUFFICIENT');
 assert.equal(record.healthy_shards,3);
 assert.equal(record.required_shards,4);
 assert.deepEqual(record.failed_indexes,[5,6]);
 assert.deepEqual(record.failure_categories,[{index:5,reason:'READ'},{index:6,reason:'READ'}]);
 assert.doesNotMatch(JSON.stringify(record)+stdout,/secret-host|credential|sensitive.example|user-secret/);
});

test('unparseable body never exposes content and is safely UNKNOWN',()=>{
 const {record}=runDiagnostic({status:'secret!danger!',errors:[{error:'evil',index:null}]});
 assert.equal(record.status,'UNKNOWN');
 assert.deepEqual(record.failed_indexes,[]);
 assert.deepEqual(record.failure_categories,[]);
});

test('stress always fails closed on exhausted HTTP 409 and still enforces hashes',()=>{
 assert.match(section,/test "\$STRESS_OK" -eq 1/);
 assert.match(section,/STRESS_RECONSTRUCTION_SHA_MISMATCH/);
 assert.match(section,/STRESS_RECONSTRUCTION_HASH_INVALID/);
 assert.match(section,/STRESS_RECONSTRUCTION_NOT_INDEPENDENT/);
 assert.match(workflow,/shardvault-reconstruction-stress-\$\{\{ github.sha \}\}[\s\S]*stress-reconstruction-failures\.ndjson/);
 assert.doesNotMatch(section,/console\.log\([^\n]*stress-reconstruct\.json/);
});
