import test from 'node:test';
import assert from 'node:assert/strict';
import {packageContentFingerprint,rememberCouncilRejectedPackage,isCouncilRejectedPackage} from '../src/evolution/council-rejected-package.js';
import {preparedMissionPackage,prepareApprovedBridgePackage} from '../src/evolution/autonomy-bridge-preparer.js';
import {ROADMAP_CODE_CONTRACTS} from '../src/roadmap/roadmap-code-contracts.js';
import {D1DevJobRepository} from '../src/dev/d1-dev-job-repository.js';

const SHA='a'.repeat(40),BRANCH='candidate/mel-clean-autonomy';
const rejectedFiles=[{path:'src/example.js',content:'export const ready = true;\n',reason:'initial'}];
async function rejectedHistory(files=rejectedFiles){return rememberCouncilRejectedPackage({files_json:files,result_json:{council_review:{decision:'REJECTED',head:SHA}}},'2026-11-05T15:00:00Z');}

test('Council veto follows actual file bytes across cache deletion and changed metadata',async()=>{
 const history=await rejectedHistory();
 const job={result_json:{council_rejected_packages:history,council_review:{decision:'REJECTED',addressed_in_repair_at:'now'}}};
 assert.equal(await isCouncilRejectedPackage(job,[{...rejectedFiles[0],reason:'renamed',base_sha256:'different',provider:'new'}]),true);
 assert.equal(await isCouncilRejectedPackage(job,[{...rejectedFiles[0],content:'export const ready = "corrected";\n'}]),false);
 assert.equal(await isCouncilRejectedPackage({result_json:{}},rejectedFiles),false,'no veto is invented for innocent jobs');
 assert.equal(history[0].candidate_sha,SHA);
});

test('fingerprint is stable across file ordering and bounded to the existing repair budget',async()=>{
 const files=[...rejectedFiles,{path:'tests/example.test.mjs',content:'test();'}];
 assert.equal(await packageContentFingerprint(files),await packageContentFingerprint([...files].reverse()));
 let history=[];
 for(let i=0;i<12;i++)history=await rememberCouncilRejectedPackage({files_json:[{path:'src/example.js',content:String(i)}],result_json:{council_rejected_packages:history,council_review:{head:SHA}}},'now');
 assert.equal(history.length,8);
 assert.equal(new Set(history.map(row=>row.content_sha256)).size,8);
 assert.equal(await packageContentFingerprint([]),null);
});

test('an identical prepared package stays vetoed after its READY cache is removed; a corrected revision is eligible',async()=>{
 const id=Object.keys(ROADMAP_CODE_CONTRACTS)[0],contract=ROADMAP_CODE_CONTRACTS[id];
 let changes=[{path:contract.code_paths[0],base_sha256:'new',content:'CODE_CIBLE'},
  {path:contract.test_paths[0],base_sha256:'new',content:'TEST_CIBLE'}];
 const history=await rejectedHistory(changes);
 const job={optional_context:{roadmap_id:id},result_json:{council_review:{decision:'REJECTED',addressed_in_repair_at:'now'},council_rejected_packages:history}};
 const code={repository:'o/r',branch:BRANCH,candidate_sha:SHA};
 const fetchImpl=async url=>String(url).includes('prepared/')||String(url).includes('prepared%2F')
  ?Response.json({type:'file',sha:SHA,content:Buffer.from(JSON.stringify({roadmap_id:id,changes,tests:['test']})).toString('base64')})
  :new Response('',{status:404});
 assert.equal(await preparedMissionPackage({},code,job,[],fetchImpl),null);
 changes=changes.map((file,index)=>index?file:{...file,content:'CODE_CORRIGE'});
 assert.ok(await preparedMissionPackage({},code,job,[],fetchImpl));
});

for(const cache of [false,true])test(`the actual Bridge preparer refuses identical regenerated or cached vetoed code (cache=${cache})`,async()=>{
 const repository=new D1DevJobRepository(null,{memoryStore:new Map()});
 const created=await repository.create({id:'vetoed',requested_by:'mel-autonomy',goal:'Same approved objective'});
 const result={council_rejected_packages:await rejectedHistory(),
  council_review:{decision:'REJECTED',head:SHA,repair_required:true,addressed_in_repair_at:'now',objections:['correct the implementation']},
  teacher_bridge:{status:'ANSWERED',request:{request_id:'req'},review:{request_id:'req',verdict:'APPROVE_PLAN',development_allowed:true}},
  implementation_proposal:{status:'READY',teacher_request_id:'req',candidate_branch:BRANCH,candidate_sha:SHA,
   inspected_files:[{path:'src/example.js',sha:'source'}],providers_attempted:['a','b'],selected:{model:'a',text:'plan'},production_touched:false,candidate_write_performed:false},
  ...(cache?{bridge_preparation:{status:'READY',teacher_request_id:'req',candidate_branch:BRANCH,candidate_sha:SHA}}:{}),
 };
 await repository.update(created.id,{status:'TEACHER_APPROVED',files_json:rejectedFiles,tests_json:[{command:'test'}],result_json:result});
 const job=await repository.get(created.id);
 const fetchImpl=async url=>String(url).includes('/commits/')?Response.json({sha:SHA})
  :String(url).startsWith('https://raw.githubusercontent.com/')?new Response('export const ready = false;\n')
  :new Response('',{status:403});
 await assert.rejects(prepareApprovedBridgePackage({env:{MEL_GITHUB_REPOSITORY:'o/r',MEL_TEACHER_BRANCH:BRANCH},repository,job,fetchImpl,
  mentorEngine:{propose:async()=>({proposal:{changes:rejectedFiles,tests:['test'],provenance:{provider:'fresh-model'}}})}}),
  error=>error.code==='MENTOR_NO_VALID_CODE_PROPOSAL'&&error.failures.some(row=>row.error==='COUNCIL_REJECTED_PACKAGE_REPLAY'));
 assert.deepEqual((await repository.get(created.id)).files_json,rejectedFiles,'no new vetoed packet was persisted');
});

test('the real repair transition persists the veto before removing cached packages',async()=>{
 const {runAutonomyRuntimeTick}=await import('../src/evolution/autonomy-runtime-core.js');
 const repository=new D1DevJobRepository(null,{memoryStore:new Map()});
 const job=await repository.create({id:'transition',requested_by:'mel-autonomy',goal:'Preserve this approved goal'});
 await repository.update(job.id,{status:'REPAIR_REQUIRED',files_json:rejectedFiles,result_json:{
  teacher_bridge:{status:'ANSWERED',request:{request_id:'req'},review:{request_id:'req',verdict:'APPROVE_PLAN',development_allowed:true}},
  implementation_proposal:{status:'READY'},bridge_preparation:{status:'READY'},bridge_package:{status:'READY'},
  council_review:{decision:'REJECTED',head:SHA,repair_required:true},
  dev_bridge:{needs_repair:true,tests:[{command:'git.push',error:'CANDIDATE_PUSH_NOT_FAST_FORWARD',passed:false}]},
 }});
 await runAutonomyRuntimeTick({}, {repository,roadmap:[],maxAutonomy:true,epochMs:0,onlyJobId:job.id,fetchImpl:async()=>new Response('',{status:403})});
 const after=await repository.get(job.id);
 assert.equal(after.goal,job.goal);assert.equal(after.status,'QUEUED','the incomplete old Teacher evidence must be reviewed again');
 assert.equal(await isCouncilRejectedPackage(after,rejectedFiles),true);
 assert.ok(after.result_json.council_review.addressed_in_repair_at);
 assert.equal(after.result_json.bridge_preparation,undefined);assert.equal(after.result_json.bridge_package,undefined);
 assert.equal(after.result_json.repair_cycle.max_attempts,8);
});

test('authenticated cloud claim and final precommit both veto identical rejected bytes',async t=>{
 const {sqliteD1}=await import('./helpers/sqlite-d1.mjs');
 const {setAutonomyControl}=await import('../src/evolution/autonomy-control.js');
 const {devRuntime}=await import('../src/dev/runtime-api.js');
 const db=sqliteD1();t.after(()=>db.close());
 await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'owner-ui-launch-gate'});
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='replay-test';jwk.alg='RS256';
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const unsigned=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:'https://token.actions.githubusercontent.com',aud:'meliturgos-worker',repository:'o/r',workflow_ref:'o/r/.github/workflows/gen2-42-apply-ready-bridge.yml@refs/heads/main',event_name:'workflow_dispatch',actor:'owner',sha:SHA,run_id:99,iat:now,exp:now+300});
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(unsigned));
 const token=unsigned+'.'+Buffer.from(signature).toString('base64url');
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>Response.json(String(url).includes('openid-configuration')
  ?{issuer:'https://token.actions.githubusercontent.com',jwks_uri:'https://token.actions.githubusercontent.com/keys'}:{keys:[jwk]});
 t.after(()=>{globalThis.fetch=previous;});
 let claims=0;
 const job={id:'vetoed-bridge',requested_by:'mel-autonomy',status:'CLAIMED',files_json:rejectedFiles,
  result_json:{bridge_preparation:{status:'READY'},council_rejected_packages:await rejectedHistory()}};
 const repository={get:async()=>job,claimPrepared:async()=>{claims++;return job;}};
 const run=path=>devRuntime(new Request('https://mel.test/api/dev-bridge/'+path,{method:'POST',headers:{'content-type':'application/json','x-mel-github-oidc':token},body:JSON.stringify({job_id:job.id})}),{DB:db,MEL_GITHUB_REPOSITORY:'o/r'},{repository});
 for(const path of ['claim','precommit']){
  const response=await run(path);assert.equal(response.status,409,path);
  assert.equal((await response.json()).code,'COUNCIL_REJECTED_PACKAGE_REPLAY');
 }
 assert.equal(claims,0);
 job.files_json=[{...rejectedFiles[0],content:'export const ready = "corrected";\n'}];
 assert.equal((await run('precommit')).status,200,'a genuinely corrected proposal keeps the normal proof path');
});

for(const unavailable of [false,true])test(`a veto is bound to reviewed GitHub bytes, never newer D1 proposals (unavailable=${unavailable})`,async()=>{
 const {runAutonomyRuntimeTick}=await import('../src/evolution/autonomy-runtime-core.js');
 const repository=new D1DevJobRepository(null,{memoryStore:new Map()});
 const created=await repository.create({id:'reviewed-bytes',requested_by:'mel-autonomy',goal:'Same objective'});
 const corrected=[{...rejectedFiles[0],content:'export const ready = "corrected after review";\n'}];
 await repository.update(created.id,{status:'REPAIR_REQUIRED',files_json:corrected,result_json:{
  teacher_bridge:{status:'ANSWERED',request:{request_id:'req'},review:{request_id:'req',verdict:'APPROVE_PLAN',development_allowed:true}},
  implementation_proposal:{status:'READY'},bridge_preparation:{status:'READY'},bridge_package:{status:'READY'},
  council_review:{decision:'REJECTED',head:SHA,repair_required:true},
  dev_bridge:{needs_repair:true,applied_files:['src/example.js'],tests:[]},
 }});
 const before=await repository.get(created.id),reads=[];
 const result=await runAutonomyRuntimeTick({MEL_GITHUB_REPOSITORY:'o/r'}, {repository,roadmap:[],maxAutonomy:true,epochMs:0,onlyJobId:created.id,
  fetchImpl:async url=>{
   reads.push(String(url));
   if(unavailable)return new Response('',{status:503});
   if(String(url).startsWith('https://raw.githubusercontent.com/')&&String(url).includes('/src/example.js')&&String(url).includes(SHA))return new Response(rejectedFiles[0].content);
   return new Response('',{status:403});
  }});
 const after=await repository.get(created.id);
 assert.ok(reads.some(url=>url.includes(SHA)),'the read is pinned to the vetoed SHA');
 if(unavailable){
  assert.equal(result.status,'COUNCIL_REJECTED_CONTENT_UNAVAILABLE');
  assert.deepEqual(after,before,'a GitHub outage consumes no code-repair attempt and invents no negative fingerprint');
 }else{
  assert.equal(await isCouncilRejectedPackage(after,rejectedFiles),true);
  assert.equal(await isCouncilRejectedPackage(after,corrected),false,'an innocent newer proposal is never mislabeled as vetoed');
 }
});
