import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryBundleBuilder } from '../src/resilience/recovery-bundle.js';
import worker from '../src/index.js';

function db(){
  return {prepare(){return{bind(){return this},async first(){return{count:0}},async all(){return{results:[]}},async run(){return{success:true}}}}};
}
const auth='Basic '+Buffer.from('adrien:test').toString('base64');

test('current owner surfaces and memory export remain authenticated', async()=>{
  const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',DB:db()};
  assert.equal((await worker.fetch(new Request('https://mel.test/professor'),env,{})).status,401);
  const professor=await worker.fetch(new Request('https://mel.test/professor',{headers:{authorization:auth}}),env,{});
  assert.equal(professor.status,200);
  assert.match(await professor.text(),/Mode complet/);
  assert.equal((await worker.fetch(new Request('https://mel.test/api/export'),env,{})).status,401);
});

test('recovery bundle is integrity checked, secret-redacted and never auto-activates', async()=>{
  const builder=new RecoveryBundleBuilder({now:()=> '2026-09-18T13:00:00.000Z'});
  const bundle=await builder.build({
    sourceCommit:'abc123',
    artifacts:[{path:'src/index.js',sha256:'hash'}],
    exports:[{kind:'memory',password:'must-not-leak'}],
    destinations:[{id:'backup-1',kind:'archive',authorized:true,encrypted:true}],
  });
  assert.equal(bundle.exports[0].password,'[REDACTED]');
  assert.equal(bundle.restore.automaticActivation,false);
  assert.equal((await builder.verify(bundle)).ok,true);
  const tampered={...bundle,source:{commit:'other'}};
  assert.equal((await builder.verify(tampered)).ok,false);
  const plan=builder.replicationPlan(bundle);
  assert.equal(plan[0].automaticActivation,false);
  assert.equal(plan[0].requiresOperatorRestore,true);
});
