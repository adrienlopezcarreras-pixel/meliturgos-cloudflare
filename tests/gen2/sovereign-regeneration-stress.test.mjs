import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderNeutralSystemBundle } from '../../src/portability/system-bundle.js';
import {
  createSovereignRegenerationBundle,
  verifySovereignRegenerationBundle,
  planSovereignRegeneration,
} from '../../src/continuity/sovereign-regeneration-bundle.js';

async function runtimeBundle(seed=0){
  const components=[
    ['config','core.config',{schema:'mel.core-config-export/v1',app:{name:'MEL',seed},defaults:{},database:{schema_version:'test'}}],
    ['memory','memory.export',{schema:'mel.portable-memory/v1',records:[{id:'m'+seed}]}],
    ['projects','planning.projects',{schema:'mel.planning-projects-export/v1',projects:[],decisions:[],lessons:[]}],
    ['plugins','plugins.registry',{schema:'mel.plugin-runtime-export/v1',plugins:[]}],
    ['skills','skills.registry',{schema:'mel.skill-registry/v1',skills:[],active:{}}],
  ].map(([id,contract,payload])=>({
    id,contract:{id:contract,version:'1',required:true,description:id},
    format:'application/json',
    export:async()=>payload,
  }));
  return createProviderNeutralSystemBundle({
    generated_at:new Date(Date.UTC(2026,8,28,18,0,0)+seed*1000).toISOString(),
    source:{branch:'main',commit:'a'.repeat(40)},
    components,
  });
}

async function regen(seed=0){
  return createSovereignRegenerationBundle({
    sourceSha:'a'.repeat(40),
    codeReconstruction:{
      format:'RS_4_OF_7',
      data_shards:4,
      total_shards:7,
      reconstructable:true,
      independent_of_primary_provider:true,
      manifest_ref:'shardvault/manifests/'+seed,
      expected_sha256:'f'.repeat(64),
    },
    runtimeBundle:await runtimeBundle(seed),
    roadmap:{seed,status:'portable'},
    autonomy:{max_autonomy:true,status:'MAX_AUTONOMY'},
    generatedAt:new Date(Date.UTC(2026,8,28,18,10,0)+seed*1000).toISOString(),
  });
}

test('stress: 100 regeneration bundles verify and authorize unattended restore only under all emergency conditions',async()=>{
  for(let i=0;i<100;i++){
    const bundle=await regen(i);
    const verified=await verifySovereignRegenerationBundle(bundle);
    assert.equal(verified.ok,true);

    const allowed=await planSovereignRegeneration({
      bundle,maxAutonomy:true,emergency:true,targetPrevalidated:true,ownerReachable:false,
    });
    assert.equal(allowed.activation_allowed,true);

    const blocked=await planSovereignRegeneration({
      bundle,maxAutonomy:true,emergency:true,targetPrevalidated:false,ownerReachable:false,
    });
    assert.equal(blocked.activation_allowed,false);
  }
});

test('stress: any tampered control-plane state invalidates regeneration integrity',async()=>{
  for(let i=0;i<60;i++){
    const bundle=structuredClone(await regen(i));
    if(i%4===0) bundle.roadmap.status='tampered';
    else if(i%4===1) bundle.autonomy.status='RUNNING';
    else if(i%4===2) bundle.code.manifest_ref+='-tampered';
    else bundle.runtime_bundle.manifest.source.branch='tampered';

    const verified=await verifySovereignRegenerationBundle(bundle);
    assert.equal(verified.ok,false);
    assert.ok(verified.issues.includes('INTEGRITY_MISMATCH') || verified.issues.includes('RUNTIME_BUNDLE_INVALID'));
  }
});

test('stress: regeneration refuses provider-dependent or non-reconstructable code every time',async()=>{
  for(let i=0;i<80;i++){
    await assert.rejects(
      async()=>createSovereignRegenerationBundle({
        sourceSha:'a'.repeat(40),
        codeReconstruction:{
          data_shards:4,
          total_shards:7,
          reconstructable:i%2===0,
          independent_of_primary_provider:i%2!==0,
        },
        runtimeBundle:await runtimeBundle(i),
      }),
      error=>[
        'REGEN_CODE_NOT_RECONSTRUCTABLE',
        'REGEN_CODE_PROVIDER_INDEPENDENCE_REQUIRED',
      ].includes(error?.code),
    );
  }
});
