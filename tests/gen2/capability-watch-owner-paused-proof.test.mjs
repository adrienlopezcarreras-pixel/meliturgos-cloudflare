import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from '../helpers/sqlite-d1.mjs';
import {migrate} from '../../src/persistence/migrations.js';
import {setAutonomyControl,getAutonomyControl} from '../../src/evolution/autonomy-control.js';
import {proveEcosystemTeacherHandoff} from '../../src/evaluation/capability-watch-runtime.js';
import {maybeHandleReleaseLaunchBootstrap} from '../../src/evolution/release-launch-bootstrap.js';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const valid={ok:true,status:'GEN2_42_TEACHER_HANDOFF_PAUSE_VERIFIED',pause_verified:true,paused:true,max_autonomy:false,pause_kind:'OWNER_STOP',control_version:42,no_execution_attempted:true,production_activation_allowed:false,auto_approval_allowed:false};

test('a real owner/repair stop proves no execution without resuming a persisted Council-ready handoff',async()=>{
 for(const [source,kind] of [['owner-ui','OWNER_STOP'],['bridge-repair-pause','REPAIR_REQUIRED']]){
  const DB=sqliteD1();try{
   await migrate(DB);
   await setAutonomyControl(DB,{paused:true,max_autonomy:false,source,reason:source==='owner-ui'?'owner-stop':'bridge-repair-required:fixture'});
   const before=await getAutonomyControl(DB);
   const ledger={items:[{fingerprint:'pending',handoff:{job_id:'pending-job',status:'COUNCIL_COMPLETE',closed:false}}]};
   await DB.prepare('INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)').bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),1).run();
   let calls=0;
   const proof=await proveEcosystemTeacherHandoff({DB},{developmentRepository:{async get(){calls++;throw Error('NO_JOB_SIDE_EFFECTS');}},resumeTeacherRequest:async()=>{calls++;throw Error('MUST_NOT_RUN');},mirrorTeacherRequest:async()=>{calls++;throw Error('MUST_NOT_MIRROR');}});
   assert.equal(calls,0);assert.equal(proof.ok,true);assert.equal(proof.status,valid.status);assert.equal(proof.pause_kind,kind);
   assert.equal(proof.control_version,before.updated_at);assert.equal(proof.no_execution_attempted,true);
   assert.equal(proof.production_activation_allowed,false);assert.equal(proof.auto_approval_allowed,false);
   assert.equal(proof.idle_verified,undefined);assert.equal(proof.observed_handoff_count,1);
   assert.deepEqual(await getAutonomyControl(DB),before);
   const after=await DB.prepare('SELECT state_json FROM capability_watch_state WHERE id=?').bind('ecosystem-discoveries-canonical').first();
   assert.equal(after.state_json,JSON.stringify(ledger));
  }finally{DB.close();}
 }
});

test('a technical release pause does not certify an unprepared handoff as a verified owner stop',async()=>{
 const DB=sqliteD1();try{
  await migrate(DB);await setAutonomyControl(DB,{paused:true,max_autonomy:false,source:'release-launch-bootstrap',reason:'NEW_RELEASE_AWAITING_OWNER_LAUNCH'});
  await DB.prepare('INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)').bind('ecosystem-discoveries-canonical',JSON.stringify({items:[{fingerprint:'pending',handoff:{job_id:'pending-job',status:'QUEUED',closed:false}}]}),1).run();
  const proof=await proveEcosystemTeacherHandoff({DB},{developmentRepository:{async get(){return {id:'pending-job',status:'QUEUED',requested_by:'mel-autonomy',optional_context:{source:'ecosystem-watch'},plan_json:{},result_json:{}};}}});
  assert.equal(proof.ok,false);assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_NOT_READY');assert.notEqual(proof.pause_verified,true);
 }finally{DB.close();}
});

const script=readFileSync('scripts/release-autonomy-deep-proof.sh','utf8');
const start=script.indexOf("const d=require('./production-capability-watch-proof.json');");
const end=script.indexOf('\nNODE',start);
const validator=script.slice(start,end);
function shellAccepts(proof){
 try{execFileSync(process.execPath,['-e',validator.replace("require('./production-capability-watch-proof.json')",JSON.stringify(proof))],{stdio:'pipe'});return true;}catch{return false;}
}

test('server and executable release guard accept only a complete paused proof without granting activation',async()=>{
 const token='test-owner-pause-token-000000000000000000000';
 for(const override of [{},{pause_verified:false},{paused:false},{max_autonomy:true},{pause_kind:'TECHNICAL'},{control_version:0},{control_version:'42'},{no_execution_attempted:false},{job_id:'claimed'},{teacher_request_id:'waiting'},{production_activation_allowed:true},{auto_approval_allowed:true}]){
  const proof={...valid,...override};
  const response=await maybeHandleReleaseLaunchBootstrap(new Request('https://mel.test/api/internal/release-launch-bootstrap',{method:'POST',headers:{'x-mel-launch-bootstrap':token,'content-type':'application/json'},body:JSON.stringify({phase:'capability-watch-proof'})}),{MEL_LAUNCH_BOOTSTRAP_TOKEN:token,DB:{}},{setControl:async()=>{throw Error('NO_CONTROL_MUTATION');},proveCapabilityWatch:async()=>proof});
  const accepted=Object.keys(override).length===0;
  assert.equal(response.status,accepted?200:409,JSON.stringify(override));assert.equal(shellAccepts(proof),accepted,JSON.stringify(override));
  const body=await response.json();assert.equal(body.production_activation_allowed,false);assert.equal(body.auto_approval_allowed,false);assert.equal(body.autonomy_started,false);
 }
});
