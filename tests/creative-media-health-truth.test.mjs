import test from 'node:test';
import assert from 'node:assert/strict';
import {createGen2Runtime} from '../src/core/orchestrator/gen2-runtime.js';

const mediaIds=[
  'media.image.analyze','media.image.process','media.image.generate',
  'media.audio.transcribe','media.audio.synthesize',
  'media.video.analyze','media.video.process','media.video.generate',
];

test('unconfigured media providers report unavailability reasons but never healthy',()=>{
  const bus=createGen2Runtime({env:{}}).bus;
  for(const id of mediaIds){
    const record=bus.describe(id);
    assert.equal(record.enabled,true);
    assert.equal(record.health,'UNAVAILABLE',id);
    assert.equal(record.health_detail,
      id==='media.video.process'
        ? 'MEDIA_VAULT_CONFIGURATION_MISSING'
        : 'MEDIA_AI_BINDING_MISSING',id);
  }
});
test('AI binding alone is NOT a zero-cost media model proof',()=>{
  let invoked=false;
  const bus=createGen2Runtime({env:{AI:{run:async()=>{invoked=true;throw Error('UNEXPECTED_CALL');}}}}).bus;
  assert.equal(bus.describe('media.image.generate').health,'UNAVAILABLE');
  assert.equal(bus.describe('media.image.generate').health_detail,'MEDIA_ZERO_COST_MODEL_PROOF_MISSING');
  assert.equal(bus.describe('media.audio.transcribe').health_detail,'MEDIA_ZERO_COST_MODEL_PROOF_MISSING');
  assert.equal(invoked,false);
});
test('video processing distinguishes missing encrypted vault from missing browser provenance',()=>{
  const env={MEDIA_BUCKET:{put:async()=>{throw Error('UNEXPECTED_WRITE');}},
    MEL_MEDIA_ENCRYPTION_KEY_ID:'fixture-id',MEL_MEDIA_ENCRYPTION_KEY_B64:'fixture-key'};
  const bus=createGen2Runtime({env}).bus;
  assert.equal(bus.describe('media.video.process').health_detail,
    'MEDIA_BROWSER_PROVENANCE_OR_BINDING_MISSING');
});

test('explicitly configured adapter is healthy while unrelated media remains unavailable',()=>{
  const bus=createGen2Runtime({env:{MEL_MEDIA_CAPABILITIES:{
    'media.image.analyze':async()=>({ok:true}),
  }}}).bus;
  assert.equal(bus.describe('media.image.analyze').health,'HEALTHY');
  assert.equal(bus.describe('media.image.analyze').health_detail,undefined);
  assert.equal(bus.describe('media.video.analyze').health,'UNAVAILABLE');
});
test('companion binding is not treated as a working media capability until health passes',async()=>{
  let reads=0;
  const bus=createGen2Runtime({env:{MEL_MEDIA_COMPANION:{fetch:async()=>{
    reads++;
    return new Response(null,{status:503});
  }}}}).bus;
  assert.equal(bus.describe('media.image.generate').health,'DEGRADED');
  assert.equal(bus.describe('media.image.generate').health_detail,'MEDIA_COMPANION_HEALTH_NOT_YET_VERIFIED');
  const inspected=await bus.refreshHealth('media.image.generate');
  assert.equal(inspected.health,'UNAVAILABLE');
  assert.equal(inspected.health_detail,'MEDIA_COMPANION_HEALTH_REJECTED');
  assert.equal(reads,1);
});
test('unreachable companion returns a short sanitized reason, not exception contents',async()=>{
  const bus=createGen2Runtime({env:{MEL_MEDIA_COMPANION:{fetch:async()=>{
    throw new Error('user-secret-never-log');
  }}}}).bus;
  const inspected=await bus.refreshHealth('media.audio.synthesize');
  assert.equal(inspected.health,'UNAVAILABLE');
  assert.equal(inspected.health_detail,'MEDIA_COMPANION_HEALTH_UNREACHABLE');
  assert.doesNotMatch(JSON.stringify(inspected),/user-secret-never-log/);
});
test('health validation does not trigger billed AI calls, file writes or generation',async()=>{
  let invoked=false;
  const bus=createGen2Runtime({env:{AI:{run:async()=>{
    invoked=true;throw Error('UNEXPECTED_COST');
  }}}}).bus;
  const inspected=await bus.refreshHealth('media.image.generate');
  assert.equal(inspected.health,'UNAVAILABLE');
  assert.equal(invoked,false);
});
