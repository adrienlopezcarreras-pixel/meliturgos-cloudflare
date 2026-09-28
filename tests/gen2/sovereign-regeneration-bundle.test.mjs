import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderNeutralSystemBundle } from '../../src/portability/system-bundle.js';
import {
  createSovereignRegenerationBundle,
  verifySovereignRegenerationBundle,
  planSovereignRegeneration,
} from '../../src/continuity/sovereign-regeneration-bundle.js';

async function runtimeBundle(){
  const components=[
    ['config','core.config',{schema:'mel.core-config-export/v1',app:{name:'MEL'},defaults:{},database:{schema_version:'test'}}],
    ['memory','memory.export',{schema:'mel.portable-memory/v1',records:[]}],
    ['projects','planning.projects',{schema:'mel.planning-projects-export/v1',projects:[],decisions:[],lessons:[]}],
    ['plugins','plugins.registry',{schema:'mel.plugin-runtime-export/v1',plugins:[]}],
    ['skills','skills.registry',{schema:'mel.skill-registry/v1',skills:[],active:{}}],
  ].map(([id,contract,payload])=>({
    id,
    contract:{id:contract,version:'1',required:true,description:id},
    format:'application/json',
    export:async()=>payload,
  }));
  return createProviderNeutralSystemBundle({
    generated_at:'2026-09-28T17:10:00.000Z',
    source:{branch:'main',commit:'a'.repeat(40)},
    components,
  });
}

async function regeneration(){
  return createSovereignRegenerationBundle({
    sourceSha:'a'.repeat(40),
    codeReconstruction:{
      format:'RS_4_OF_7',
      data_shards:4,
      total_shards:7,
      reconstructable:true,
      independent_of_primary_provider:true,
      manifest_ref:'shardvault/manifests/mel-primary/latest',
      expected_sha256:'f'.repeat(64),
    },
    runtimeBundle:await runtimeBundle(),
    roadmap:{version:1,status:'portable'},
    autonomy:{max_autonomy:true,status:'MAX_AUTONOMY'},
    generatedAt:'2026-09-28T17:11:00.000Z',
  });
}

test('sovereign regeneration bundle binds reconstructable code to all required portable runtime contracts',async()=>{
  const bundle=await regeneration();
  const verified=await verifySovereignRegenerationBundle(bundle);
  assert.equal(verified.ok,true);
  assert.equal(verified.unattended_emergency_ready,true);
  assert.equal(bundle.code.data_shards,4);
  assert.equal(bundle.code.total_shards,7);
  assert.equal(bundle.runtime_bundle.integrity.artifact_count,5);
});

test('unattended regeneration is allowed only for MAX + emergency + prevalidated target',async()=>{
  const bundle=await regeneration();
  const allowed=await planSovereignRegeneration({
    bundle,maxAutonomy:true,emergency:true,targetPrevalidated:true,ownerReachable:false,
  });
  assert.equal(allowed.ok,true);
  assert.equal(allowed.activation_allowed,true);
  assert.equal(allowed.owner_presence_required,false);
  assert.equal(allowed.status,'REGEN_UNATTENDED_EMERGENCY_ALLOWED');

  for(const options of [
    {maxAutonomy:false,emergency:true,targetPrevalidated:true},
    {maxAutonomy:true,emergency:false,targetPrevalidated:true},
    {maxAutonomy:true,emergency:true,targetPrevalidated:false},
  ]){
    const plan=await planSovereignRegeneration({bundle,...options,ownerReachable:false});
    assert.equal(plan.activation_allowed,false);
    assert.equal(plan.owner_presence_required,true);
    assert.equal(plan.status,'REGEN_PREPARED');
  }
});

test('tampering any regeneration state invalidates the bundle',async()=>{
  const bundle=structuredClone(await regeneration());
  bundle.autonomy.status='tampered';
  const verified=await verifySovereignRegenerationBundle(bundle);
  assert.equal(verified.ok,false);
  assert.ok(verified.issues.includes('INTEGRITY_MISMATCH'));
});

test('provider-dependent code reconstruction cannot be certified sovereign',async()=>{
  await assert.rejects(
    ()=>createSovereignRegenerationBundle({
      sourceSha:'a'.repeat(40),
      codeReconstruction:{
        data_shards:4,total_shards:7,reconstructable:true,independent_of_primary_provider:false,
      },
      runtimeBundle:await runtimeBundle(),
    }),
    error=>error?.code==='REGEN_CODE_PROVIDER_INDEPENDENCE_REQUIRED',
  );
});
