import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKERS_AI_IMAGE_MODEL,
  WORKERS_AI_IMAGE_EDIT_MODEL,
  WORKERS_AI_VISION_MODEL,
  WORKERS_AI_TTS_MODEL,
  WORKERS_AI_TRANSCRIPTION_MODEL,
  createWorkersAiZeroCostMediaCapabilities,
} from '../src/media/workers-ai-media-capabilities.js';
import { createProceduralAudioCapabilities } from '../src/media/procedural-audio-capabilities.js';
import {
  WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
  WORKERS_AI_ZERO_COST_PRICING_POLICY,
} from '../src/augmentio/workers-ai-zero-cost-proof.js';

const REQUIRED = Object.freeze([
  'media.image.analyze',
  'media.image.process',
  'media.image.generate',
  'media.audio.analyze',
  'media.audio.generate',
  'media.audio.synthesize',
  'media.audio.transcribe',
  'media.music.analyze',
  'media.music.generate',
  'media.video.analyze',
  'media.video.process',
  'media.video.generate',
]);

function keyB64(){return Buffer.from(Uint8Array.from({length:32},(_,i)=>i+91)).toString('base64');}
function workersProof(now=Date.now()){
  return JSON.stringify({
    schema:WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
    provider:'workers-ai',
    account_plan:'WORKERS_FREE',
    billing_path:'direct-workers-ai-binding',
    pricing_policy:WORKERS_AI_ZERO_COST_PRICING_POLICY,
    free_allocation_neurons_per_day:10000,
    free_overage_behavior:'FAIL_NOT_BILL',
    plan_evidence:{
      source:'cloudflare-account-entitlements-api',
      account_type:'standard',
      entitlement_key:'workers.static_assets.manifest_limit_file_count',
      entitlement_value:20000,
      workers_free_reference_value:20000,
    },
    models:[
      WORKERS_AI_IMAGE_MODEL,
      WORKERS_AI_IMAGE_EDIT_MODEL,
      WORKERS_AI_VISION_MODEL,
      WORKERS_AI_TTS_MODEL,
      WORKERS_AI_TRANSCRIPTION_MODEL,
    ],
    verified_at:new Date(now-5000).toISOString(),
    expires_at:new Date(now+30*60_000).toISOString(),
  });
}
function browserProof(now=Date.now()){
  return JSON.stringify({
    schema:'mel.browser-run.zero-cost-proof/v1',
    provider:'cloudflare-browser-run',
    account_plan:'WORKERS_FREE',
    included_minutes_per_day:10,
    overage_behavior:'HARD_LIMIT_NO_BILLING',
    documentation_url:'https://developers.cloudflare.com/browser-run/pricing/',
    verified_at:new Date(now-5000).toISOString(),
    expires_at:new Date(now+30*60_000).toISOString(),
  });
}
function env(){
  return {
    MELITURGOS_USER:'owner',
    MEL_MEDIA_ENCRYPTION_KEY_ID:'matrix-test',
    MEL_MEDIA_ENCRYPTION_KEY_B64:keyB64(),
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON:workersProof(),
    MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON:browserProof(),
    MEDIA_BUCKET:{async put(){}},
    AI:{async run(){throw new Error('MATRIX_TEST_MUST_NOT_EXECUTE_PROVIDER');}},
    MEL_BROWSER_COMPANION:{async fetch(){return Response.json({ok:true,schema:'mel.media.browser-render-video.result/v1',mime:'video/webm',base64:'AQ==',bytes:1});}},
  };
}

test('MEL-MEDIA-02 exposes exactly the 12 required executable capability handlers under valid zero-cost proofs',()=>{
  const runtime=env();
  const merged={
    ...createProceduralAudioCapabilities(runtime),
    ...createWorkersAiZeroCostMediaCapabilities(runtime),
  };
  assert.deepEqual(Object.keys(merged).sort(),[...REQUIRED].sort());
  for(const id of REQUIRED) assert.equal(typeof merged[id],'function',id+' must have a real handler');
});

test('MEL-MEDIA-02 capability matrix remains fail-closed when zero-cost proofs are removed',()=>{
  const runtime=env();
  delete runtime.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON;
  delete runtime.MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON;
  const merged={
    ...createProceduralAudioCapabilities(runtime),
    ...createWorkersAiZeroCostMediaCapabilities(runtime),
  };
  assert.equal(typeof merged['media.audio.analyze'],'function');
  assert.equal(typeof merged['media.music.analyze'],'function');
  assert.equal(typeof merged['media.audio.generate'],'function');
  assert.equal(typeof merged['media.music.generate'],'function');
  for(const id of REQUIRED.filter(x=>!['media.audio.analyze','media.music.analyze','media.audio.generate','media.music.generate'].includes(x))){
    assert.equal(merged[id],undefined,id+' must disappear without its verified zero-cost proof');
  }
});
