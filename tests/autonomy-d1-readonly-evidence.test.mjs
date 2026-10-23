import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { CONTROL_SQL,readAutonomyD1Evidence } from '../scripts/read-autonomy-d1-evidence.mjs';
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
