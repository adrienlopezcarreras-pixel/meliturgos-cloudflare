import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { CONTROL_SQL,readAutonomyD1Evidence,FOUNDER_SQL,readFounderD1Evidence,councilProviderEvidence } from '../scripts/read-autonomy-d1-evidence.mjs';
const credentials={accountId:'a'.repeat(32),apiToken:'PRIVATE_TOKEN',databaseId:'12345678-1234-1234-1234-123456789012'};

function queryFixture(metadata,status='PAUSED') {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE dev_bridge_state (bridge_id TEXT,status TEXT,last_seen INTEGER,metadata_json TEXT)');
    db.prepare('INSERT INTO dev_bridge_state VALUES (?,?,?,?)').run('mel-autonomy-control',status,100,JSON.stringify(metadata));
    const before=db.prepare('SELECT * FROM dev_bridge_state').all();
    const rows=db.prepare(CONTROL_SQL).all('mel-autonomy-control');
    assert.deepEqual(db.prepare('SELECT * FROM dev_bridge_state').all(),before);
    return rows;
  } finally {db.close();}
}
function response(rows,extra={}) {return new Response(JSON.stringify({success:true,result:[{success:true,results:rows,meta:{rows_written:0},...extra}]}),{status:200});}

for(const [source,reason,expected] of [
  ['release-predeploy-binder','predeploy-release-safety','RELEASE_PAUSE'],
  ['release-launch-bootstrap','NEW_RELEASE_AWAITING_OWNER_LAUNCH','RELEASE_PAUSE'],
  ['release-rollback-restore','restore-predeploy-autonomy-state','SAFETY_ROLLBACK'],
  ['watchdog','NO_PROGRESS','SAFETY_PROGRESS_STOP'],
  ['owner-api','PRIVATE_OWNER_REASON','OWNER_CONTROL'],
  ['private-unknown-source','PRIVATE_OWNER_REASON','PROTECTED_NON_RELEASE_STOP'],
]) {
  test(`real SELECT classifies ${expected} without exposing owner text or changing the record`,async()=>{
    const rows=queryFixture({source,reason,paused:true,max_autonomy:false,updated_at:100,owner_control_version:80});
    const proof=await readAutonomyD1Evidence({...credentials,fetchImpl:async(url,options)=>{
      assert.equal(new URL(url).hostname,'api.cloudflare.com');
      assert.equal(options.redirect,'error');assert.equal(options.method,'POST');
      const body=JSON.parse(options.body);assert.equal(body.sql,CONTROL_SQL);assert.deepEqual(body.params,['mel-autonomy-control']);
      return response(rows);
    }});
    assert.equal(proof.ok,true);assert.equal(proof.pause_class,expected);assert.equal(proof.rows_written,0);
    assert.equal(proof.control_version,100);assert.equal(proof.owner_control_version,80);
    assert.doesNotMatch(JSON.stringify(proof),/PRIVATE_|private-unknown-source/);
  });
}
test('paused legacy MAX contradictions are normalized while preserving remembered choice',async()=>{
  const proof=await readAutonomyD1Evidence({...credentials,fetchImpl:async()=>response(queryFixture({paused:true,max_autonomy:true,launch_approved_sha:'PRIVATE_TOKEN'}))});
  assert.equal(proof.paused,true);assert.equal(proof.max_autonomy,false);assert.equal(proof.max_remembered,true);assert.equal(proof.launch_approved_sha,null);
});
test('missing credentials, denied access, absent control and unproven read-only metrics never fabricate a control result',async()=>{
  const absent=await readAutonomyD1Evidence({fetchImpl:()=>{throw Error('must not query');}});assert.equal(absent.ok,false);
  for(const fetchImpl of [async()=>new Response('PRIVATE_PROVIDER_ERROR',{status:403}),async()=>response([]),async()=>response(queryFixture({paused:true}),{meta:{rows_written:1}}),async()=>{throw Error('PRIVATE_TOKEN');}]){
    const proof=await readAutonomyD1Evidence({...credentials,fetchImpl});assert.equal(proof.ok,false);assert.equal(proof.paused,undefined);assert.doesNotMatch(JSON.stringify(proof),/PRIVATE_/);
  }
});
test('no SQL or production mutation input is exposed and live credentials are confined to manual main runs',()=>{
  assert.doesNotMatch(CONTROL_SQL,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|ATTACH|REPLACE|PRAGMA)\b|;/i);
  const workflow=readFileSync(new URL('../.github/workflows/autonomy-control-readonly-evidence.yml',import.meta.url),'utf8');
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'.*github\.ref == 'refs\/heads\/main'.*github\.actor == 'adrienlopezcarreras-pixel'/);
  assert.match(workflow,/needs: contract/);assert.doesNotMatch(workflow,/wrangler (?:deploy|publish|d1)|actions: write|contents: write|schedule:/);
});


test('fixed founder diagnostic selects newest mission statuses without owner text or mutation', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE dev_bridge_state(bridge_id TEXT,last_seen INTEGER); INSERT INTO dev_bridge_state VALUES('runtime-lease:autonomy-heartbeat',200)");
    db.exec('CREATE TABLE dev_jobs(id TEXT,status TEXT,updated_at INTEGER,created_at INTEGER,candidate_branch TEXT,result_json TEXT,plan_json TEXT)');
    db.prepare('INSERT INTO dev_jobs VALUES (?,?,?,?,?,?,?)').run('mel-autonomy-mel-founder-01-e123-1','QUEUED',100,90,'candidate/mel-clean-autonomy',JSON.stringify({runtime_retry:{attempts:2},autonomy_deferral:{code:'COUNCIL_INSUFFICIENT_RESPONSES'},private:'PRIVATE_MAIL'}),'{}');
    const rows=db.prepare(FOUNDER_SQL).all();
    const proof=await readFounderD1Evidence({...credentials,fetchImpl:async(url,options)=>{
      assert.equal(JSON.parse(options.body).sql,FOUNDER_SQL);return response(rows);
    }});
    assert.equal(proof.ok,true);assert.equal(proof.jobs[0].lease_expires_at,200);assert.equal(proof.jobs[0].runtime_attempts,2);assert.equal(proof.jobs[0].deferred_code,'COUNCIL_INSUFFICIENT_RESPONSES');
    assert.doesNotMatch(JSON.stringify(proof),/PRIVATE_MAIL|PRIVATE_TOKEN/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM dev_jobs').get().n,1);
    assert.doesNotMatch(FOUNDER_SQL,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|ATTACH|REPLACE|PRAGMA)\b|;/i);
  } finally {db.close();}
});
test('founder read never accepts a response with writes or exposes transport secrets',async()=>{
  for(const fetchImpl of [async()=>response([],{meta:{rows_written:1}}),async()=>{throw Error('PRIVATE_TOKEN');}]) {
    const proof=await readFounderD1Evidence({...credentials,fetchImpl});assert.equal(proof.ok,false);assert.doesNotMatch(JSON.stringify(proof),/PRIVATE_TOKEN/);
  }
});


test('Council diagnostic exposes only persisted per-model outcomes and excludes arbitrary provider response text',()=>{
  const trace=councilProviderEvidence({council_model_attempts:JSON.stringify([{provider_id:'workers-ai',model_id:'@cf/openai/gpt-oss-120b',role:'ARCHITECTURE_REUSE',status:'TIMEOUT',duration_ms:15000,error:'COUNCIL_PROVIDER_TIMEOUT',response:'PRIVATE_OUTPUT'},{provider_id:'bad id with private text',error:'private provider error body',duration_ms:-1}]),council_model_exclusions:JSON.stringify([{id:'workers-ai',until:123}])});
  assert.equal(trace.attempts[0].model_id,'@cf/openai/gpt-oss-120b');assert.equal(trace.attempts[0].error,'COUNCIL_PROVIDER_TIMEOUT');
  assert.equal(trace.attempts[1].provider_id,null);assert.equal(trace.attempts[1].error,null);assert.equal(trace.attempts[1].duration_ms,null);
  assert.equal(trace.exclusions[0].until,123);assert.doesNotMatch(JSON.stringify(trace),/PRIVATE_OUTPUT|private provider|private text/);
  assert.deepEqual(councilProviderEvidence({council_model_attempts:'invalid json'}),{attempts:[],exclusions:[]});
});
