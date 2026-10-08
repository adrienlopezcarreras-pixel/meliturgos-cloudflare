import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKERS_AI_IMAGE_MODEL,
  WORKERS_AI_VISION_MODEL,
  WORKERS_AI_TRANSCRIPTION_MODEL,
  createWorkersAiZeroCostMediaCapabilities,
} from '../src/media/workers-ai-media-capabilities.js';
import {
  WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
  WORKERS_AI_ZERO_COST_PRICING_POLICY,
} from '../src/augmentio/workers-ai-zero-cost-proof.js';
import { BROWSER_RUN_ZERO_COST_PROOF_SCHEMA } from '../src/media/browser-run-zero-cost-proof.js';

function keyB64(){return Buffer.from(Uint8Array.from({length:32},(_,i)=>i+71)).toString('base64');}
function workersProof(models,now=Date.now()){
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
    models,
    verified_at:new Date(now-5000).toISOString(),
    expires_at:new Date(now+30*60_000).toISOString(),
  });
}
function browserProof(now=Date.now()){
  return JSON.stringify({
    schema:BROWSER_RUN_ZERO_COST_PROOF_SCHEMA,
    provider:'cloudflare-browser-run',
    account_plan:'WORKERS_FREE',
    included_minutes_per_day:10,
    overage_behavior:'HARD_LIMIT_NO_BILLING',
    documentation_url:'https://developers.cloudflare.com/browser-run/pricing/',
    verified_at:new Date(now-5000).toISOString(),
    expires_at:new Date(now+30*60_000).toISOString(),
  });
}
function fixture(){
  const writes=[],requests=[];
  const jpeg=Buffer.from('jpeg-proof-bytes');
  const audio=Buffer.from('audio-proof-bytes');
  const processed=Buffer.from('webm-processed-proof-bytes');
  const env={
    MELITURGOS_USER:'owner',
    MEL_MEDIA_ENCRYPTION_KEY_ID:'browser-video-test',
    MEL_MEDIA_ENCRYPTION_KEY_B64:keyB64(),
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON:workersProof([WORKERS_AI_IMAGE_MODEL,WORKERS_AI_VISION_MODEL,WORKERS_AI_TRANSCRIPTION_MODEL]),
    MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON:browserProof(),
    MEDIA_BUCKET:{async put(key,value,options){writes.push({key,value:new Uint8Array(value),options});}},
    MEL_BROWSER_COMPANION:{
      async fetch(request){
        requests.push({url:request.url,body:JSON.parse(await request.text())});
        const path=new URL(request.url).pathname;
        if(path==='/v1/media/process-video'){
          return Response.json({ok:true,schema:'mel.media.browser-process-video.result/v1',mime:'video/webm',base64:processed.toString('base64'),bytes:processed.length,duration_ms:1000,audio_tracks:0});
        }
        if(path==='/v1/media/sample-video'){
          return Response.json({ok:true,schema:'mel.media.browser-sample-video.result/v1',spritesheet_base64:jpeg.toString('base64'),spritesheet_mime:'image/jpeg',audio_base64:audio.toString('base64'),audio_mime:'audio/webm;codecs=opus',audio_bytes:audio.length,duration_ms:1000,image_count:3});
        }
        if(path==='/v1/media/render-video'){
          return Response.json({ok:true,schema:'mel.media.browser-render-video.result/v1',mime:'video/webm',base64:processed.toString('base64'),bytes:processed.length,width:512,height:288,duration_ms:1500,fps:10});
        }
        return Response.json({ok:false,code:'NOT_FOUND'},{status:404});
      },
    },
    AI:{
      async run(model,input){
        if(model===WORKERS_AI_TRANSCRIPTION_MODEL) return {text:'Bonjour vidéo.',word_count:2};
        if(model===WORKERS_AI_VISION_MODEL){
          if(input?.image) return {response:'Storyboard géométrique bleu sur fond clair.'};
          return {response:'La vidéo montre une forme géométrique; une courte parole est entendue.'};
        }
        if(model===WORKERS_AI_IMAGE_MODEL) return {image:jpeg.toString('base64')};
        throw new Error('UNEXPECTED_MODEL:'+model);
      },
    },
  };
  return {env,writes,requests};
}

test('Browser Run Free video process is bounded and encrypted into Media Vault',async()=>{
  const f=fixture(),caps=createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof caps['media.video.process'],'function');
  const input=Uint8Array.from([26,69,223,163,1,2,3,4]);
  const out=await caps['media.video.process']({bytes:input,mime:'video/webm',width:480,height:270,duration_seconds:1,audio:false});
  assert.equal(out.ok,true);
  assert.equal(out.provider,'cloudflare-browser-run');
  assert.equal(out.zero_added_cost,true);
  assert.equal(out.artifact.private,true);
  assert.equal(out.artifact.stored_encrypted,true);
  assert.equal(f.writes.length,1);
  assert.equal(f.requests[0].body.schema,'mel.media.browser-process-video/v1');
  assert.equal(f.requests[0].body.audio,false);
});

test('Browser Run Free video analysis samples frames and optional audio then uses Workers AI',async()=>{
  const f=fixture(),caps=createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof caps['media.video.analyze'],'function');
  const out=await caps['media.video.analyze']({
    bytes:Uint8Array.from([26,69,223,163,9,8,7,6]),
    mime:'video/webm',
    duration_seconds:1,
    image_count:3,
    language:'fr',
  });
  assert.equal(out.ok,true);
  assert.equal(out.provider,'cloudflare-browser-run+workers-ai');
  assert.equal(out.sampled_frame_count,3);
  assert.equal(out.transcript,'Bonjour vidéo.');
  assert.equal(out.transcript_status,'TRANSCRIBED');
  assert.match(out.visual_analysis,/géométrique/);
  assert.match(out.summary,/courte parole/);
  assert.equal(f.requests[0].body.schema,'mel.media.browser-sample-video/v1');
});

test('Browser Run Free video generation returns explicit frame-animation engine and encrypted artifact',async()=>{
  const f=fixture(),caps=createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(typeof caps['media.video.generate'],'function');
  const out=await caps['media.video.generate']({
    prompt:'forme géométrique bleue',
    width:512,
    height:288,
    duration_seconds:1.5,
    fps:10,
    frame_count:1,
  });
  assert.equal(out.ok,true);
  assert.equal(out.provider,'workers-ai+browser-run');
  assert.equal(out.engine,'generated-frame-animation');
  assert.equal(out.zero_added_cost,true);
  assert.equal(out.artifact.private,true);
  assert.equal(out.artifact.stored_encrypted,true);
  assert.equal(f.requests[0].body.schema,'mel.media.browser-render-video/v1');
});

test('all Browser Run video handlers disappear fail-closed without a current Workers Free proof',()=>{
  const f=fixture();
  delete f.env.MEL_BROWSER_RUN_ZERO_COST_PROOF_JSON;
  const caps=createWorkersAiZeroCostMediaCapabilities(f.env);
  assert.equal(caps['media.video.process'],undefined);
  assert.equal(caps['media.video.analyze'],undefined);
  assert.equal(caps['media.video.generate'],undefined);
});
