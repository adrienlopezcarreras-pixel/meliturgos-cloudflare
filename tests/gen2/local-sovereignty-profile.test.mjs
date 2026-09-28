import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlternativeRegistry } from '../../src/portability/prevalidated-alternative-registry.js';
import { localSovereigntyProfile, LOCAL_SOVEREIGNTY_LAYERS } from '../../src/portability/local-sovereignty-profile.js';

const now=Date.UTC(2026,8,28,18,0,0);
const proof={
  isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
  verified_at:new Date(now-1000).toISOString(),
  expires_at:new Date(now+86400000).toISOString(),
  evidence_ref:'local://proof',
  source_sha:'a'.repeat(40),
};

test('local sovereignty profile covers eight infrastructure layers',()=>{
  assert.deepEqual(
    LOCAL_SOVEREIGNTY_LAYERS.map(x=>x.layer).sort(),
    ['ci_cd','database','observability','runtime','scheduler','secrets_identity','source_control','storage'].sort(),
  );
});

test('offline companion never appears prevalidated without a fresh registry proof',()=>{
  const profile=localSovereigntyProfile({
    registry:createAlternativeRegistry([],{now}),
    device:{id:'pc1',name:'PC',online:false},
    now,
  });
  assert.equal(profile.layer_count,8);
  assert.equal(profile.prevalidated_count,0);
  assert.equal(profile.offline_count,8);
  assert.ok(profile.layers.every(x=>x.status==='DEVICE_OFFLINE'));
});

test('online companion exposes unproven layers as READY_FOR_LIVE_PROOF only',()=>{
  const profile=localSovereigntyProfile({
    registry:createAlternativeRegistry([],{now}),
    device:{id:'pc1',name:'PC',online:true},
    now,
  });
  assert.equal(profile.prevalidated_count,0);
  assert.equal(profile.ready_for_live_proof_count,8);
  assert.ok(profile.layers.every(x=>x.prevalidated===false));
});

test('fresh local Git proof upgrades only source_control',()=>{
  const registry=createAlternativeRegistry([{
    id:'local.companion.git',
    layer:'source_control',
    provider:'local-companion-git',
    added_cost_eur:0,
    proof,
  }],{now});
  const profile=localSovereigntyProfile({
    registry,
    device:{id:'pc1',name:'PC',online:true},
    now,
  });
  const git=profile.layers.find(x=>x.layer==='source_control');
  assert.equal(git.status,'PREVALIDATED');
  assert.equal(git.prevalidated,true);
  assert.equal(profile.prevalidated_count,1);
});
