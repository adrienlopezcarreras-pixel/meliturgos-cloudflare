import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CapabilityBus} from '../../src/capabilities/capability-bus.js';
import {transition} from '../../src/core/lifecycle/extension.js';
import {validateManifest} from '../../src/plugins/validator.js';
import {ModelRouter} from '../../src/models/ModelRouter.js';
import {ModelRegistry} from '../../src/models/ModelRegistry.js';
import {ChangePlan,ChangeSet,TestResult,ReleaseCandidate} from '../../src/dev/dev-agent.js';
const catalog=JSON.parse(await readFile(new URL('../../src/core/port-catalog.json',import.meta.url)));
for(const entry of catalog) test(entry.file+' exports executable fail-closed port',async()=>{
 const exports=await import(new URL('../../'+entry.file,import.meta.url));const service=exports[entry.factory]();
 for(const method of entry.methods) await assert.rejects(()=>service[method](),{code:`NOT_IMPLEMENTED:${entry.file.slice(4,-3)}.${method}`});
 const name=entry.methods[0];assert.equal(await exports[entry.factory]({[name]:async()=>42})[name](),42);
});
test('bus denies disabled, unauthorized and invalid inputs before effects; validates outputs and audits',async()=>{
 let calls=0;const events=[];const bus=new CapabilityBus({audit:async e=>events.push(e)});
 bus.discover({id:'echo',name:'Echo',category:'tool',version:'1.0.0',provider:'test',description:'test',input_schema:{type:'string'},output_schema:{type:'string'},risk:'LOW',permissions:['echo'],health:'UNKNOWN',enabled:false},async input=>{calls++;return input;});
 const ctx={owner:'test',permissions:['echo','capabilities.manage']};
 await assert.rejects(()=>bus.execute('echo','ok',ctx),{code:'CAPABILITY_DISABLED'});bus.enable('echo',ctx);
 await assert.rejects(()=>bus.execute('echo','ok',{owner:'test'}),{code:'PERMISSION_DENIED'});
 await assert.rejects(()=>bus.execute('echo',{},ctx),{code:'INVALID_TYPE'});
 assert.equal(calls,0);assert.equal(await bus.execute('echo','ok',ctx),'ok');assert.equal(calls,1);assert.deepEqual(events.map(e=>e.status),['STARTED','SUCCEEDED']);assert.ok(!JSON.stringify(events).includes('input'));
});
test('extension activation requires exact-version test, sandbox and security proofs',()=>{
 const record={version:'1.0.0',status:'CANDIDATE'};
 assert.throws(()=>transition(record,'ACTIVE'),{code:'REVIEW_EVIDENCE_REQUIRED'});
 assert.throws(()=>transition(record,'ACTIVE',{version:'0.9.0',tests:true,sandbox:true,security:true,activation:true}));
 assert.equal(transition(record,'ACTIVE',{version:'1.0.0',tests:true,sandbox:true,security:true,activation:true}).status,'ACTIVE');
 assert.throws(()=>transition({status:'DRAFT'},'ACTIVE'));
});
test('manifest rejects traversal and inline secret references',()=>{
 const m={id:'test.plugin',name:'Test',version:'1.0.0',description:'Test',author:'test',capabilities:[],permissions:[],secrets_required:[],dependencies:[],entrypoint:'main.js',healthcheck:'health',risk:'LOW'};
 assert.equal(validateManifest(m).id,m.id);assert.throws(()=>validateManifest({...m,entrypoint:'../evil.js'}));assert.throws(()=>validateManifest({...m,secrets_required:['literal-credential']}));
});
test('model capability is mandatory, fallback bounded and policies stop retries',async()=>{
 const registry=new ModelRegistry([{id:'a',capabilities:['GENERAL']},{id:'b',capabilities:['GENERAL']}]);let calls=0;
 const router=new ModelRouter({registry,invoke:async()=>{if(++calls===1)throw Error('unavailable');return {response:'ok'};}});
 assert.throws(()=>router.selectModel('VISION'));assert.equal((await router.execute({messages:[]})).attempts,2);
 router.invoke=async()=>{const e=Error('denied');e.category='provider_policy';throw e;};const before=router.getStats().calls;await assert.rejects(()=>router.execute({messages:[]}));assert.equal(router.getStats().calls-before,1);
});
test('release candidate cannot claim tests from different commit',()=>{
 const plan=ChangePlan({base_commit:'base',files:['src/a.js'],steps:['edit']});const change=ChangeSet({plan_id:plan.id,branch:'gen2/test',base_commit:'base',head_commit:'new',files:plan.files});
 assert.throws(()=>ReleaseCandidate({change,tests:[TestResult({head_commit:'old',command:'npm test',exit_code:0})]}));
 assert.equal(ReleaseCandidate({change,tests:[TestResult({head_commit:'new',command:'npm test',exit_code:0})]}).activated,false);
});
