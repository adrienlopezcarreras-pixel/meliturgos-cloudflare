import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFileUpload } from '../src/api/file-upload.js';
import { WORKERS_AI_TRANSCRIPTION_MODEL } from '../src/media/workers-ai-media-capabilities.js';
import {
  WORKERS_AI_ZERO_COST_PRICING_POLICY,
  WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
} from '../src/augmentio/workers-ai-zero-cost-proof.js';

const MEDIA_KEY_B64=Buffer.alloc(32,7).toString('base64');
const MEDIA_ENV={MEL_MEDIA_ENCRYPTION_KEY_ID:'media-v1',MEL_MEDIA_ENCRYPTION_KEY_B64:MEDIA_KEY_B64};
function uploadRequest(file) {
  const form = new FormData();
  form.append('file', file);
  return new Request('https://mel.test/api/files/upload', { method:'POST', body:form });
}

function freshFreeProof() {
  return JSON.stringify({
    account_plan:'WORKERS_FREE',
    billing_path:'direct-workers-ai-binding',
    free_overage_behavior:'FAIL_NOT_BILL',
    expires_at:new Date(Date.now()+10*60*1000).toISOString(),
  });
}

function freshExactZeroCostProof(models) {
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
    verified_at:new Date(Date.now()-1000).toISOString(),
    expires_at:new Date(Date.now()+10*60*1000).toISOString(),
  });
}

test('rich PDF upload uses Cloudflare Markdown conversion and exposes extracted text to chat', async () => {
  const calls = [];
  const env = {
    AI:{
      async toMarkdown(input, options) {
        calls.push({input,options});
        return { format:'text', mimetype:'application/pdf', data:'Page 1\nImportant content' };
      },
    },
  };
  const file = new File([new TextEncoder().encode('%PDF-1.7 fake')], 'report.pdf', { type:'application/pdf' });
  const response = await handleFileUpload(uploadRequest(file), env, { authorized:true });
  const body = await response.json();

  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].input.name,'report.pdf');
  assert.equal(calls[0].options.conversionOptions.output.format,'text');
  assert.equal(body.preview_text,'Page 1\nImportant content');
  assert.equal(body.analysis_status,'RICH_TEXT_EXTRACTED');
  assert.equal(body.analysis_provider,'cloudflare-workers-ai-to-markdown');
});

test('image analysis remains fail-closed without a fresh Workers Free no-billing proof', async () => {
  let calls = 0;
  const env = {
    AI:{ async toMarkdown(){ calls += 1; return { format:'text', data:'must not run' }; } },
  };
  const file = new File([new Uint8Array([137,80,78,71])], 'capture.png', { type:'image/png' });
  const response = await handleFileUpload(uploadRequest(file), env, { authorized:true });
  const body = await response.json();

  assert.equal(calls,0);
  assert.equal(body.preview_text,null);
  assert.equal(body.analysis_status,'IMAGE_ANALYSIS_ZERO_COST_PROOF_REQUIRED');
});

test('image analysis runs with fresh Workers Free fail-not-bill proof and asks for French description', async () => {
  const calls = [];
  const env = {
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON:freshFreeProof(),
    AI:{
      async toMarkdown(input, options) {
        calls.push({input,options});
        return { format:'text', mimetype:'image/png', data:'Une capture d’écran montrant MEL.' };
      },
    },
  };
  const file = new File([new Uint8Array([137,80,78,71])], 'capture.png', { type:'image/png' });
  const response = await handleFileUpload(uploadRequest(file), env, { authorized:true });
  const body = await response.json();

  assert.equal(calls.length,1);
  assert.equal(calls[0].options.conversionOptions.image.descriptionLanguage,'fr');
  assert.equal(body.preview_text,'Une capture d’écran montrant MEL.');
  assert.equal(body.analysis_status,'IMAGE_DESCRIBED');
});

test('unsupported binaries remain private uploads without pretending they were understood', async () => {
  let calls = 0;
  const env = {...MEDIA_ENV,AI:{ async toMarkdown(){ calls += 1; return { format:'text', data:'unexpected' }; } },MEDIA_BUCKET:{ async put(){ return undefined; } },
  };
  const file = new File([new Uint8Array([1,2,3,4])], 'archive.bin', { type:'application/octet-stream' });
  const response = await handleFileUpload(uploadRequest(file), env, { authorized:true });
  const body = await response.json();

  assert.equal(calls,0);
  assert.equal(body.preview_text,null);
  assert.equal(body.analysis_status,'STORED_PRIVATE');
  assert.equal(body.stored,true);
});


test('private R2 persistence fails closed instead of storing plaintext when Media Vault key is absent', async () => {
  let puts=0;
  const env={
    MEDIA_BUCKET:{async put(){puts+=1;}},
  };
  const file=new File([new Uint8Array([9,8,7,6])],'private.bin',{type:'application/octet-stream'});
  const response=await handleFileUpload(uploadRequest(file),env,{authorized:true});
  const body=await response.json();

  assert.equal(response.status,503);
  assert.equal(body.ok,false);
  assert.equal(body.code,'MEDIA_VAULT_KEY_ID_REQUIRED');
  assert.equal(body.stored,false);
  assert.equal(puts,0);
});

test('audio upload stays fail-closed when Whisper is not covered by a fresh zero-cost proof', async () => {
  let calls=0;
  const env={AI:{async run(){calls+=1;return {text:'must not run'};}}};
  const file=new File([Uint8Array.from([82,73,70,70,1,2,3,4])],'voice.wav',{type:'audio/wav'});
  const response=await handleFileUpload(uploadRequest(file),env,{authorized:true});
  const body=await response.json();

  assert.equal(response.status,200);
  assert.equal(calls,0);
  assert.equal(body.preview_text,null);
  assert.equal(body.analysis_status,'AUDIO_TRANSCRIPTION_ZERO_COST_PROOF_REQUIRED');
  assert.equal(body.analysis_provider,null);
});

test('small audio upload is transcribed with exact zero-cost Whisper and exposed as chat preview text', async () => {
  const source=Uint8Array.from([82,73,70,70,1,2,3,4,5,6]);
  const calls=[];
  const env={
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON:freshExactZeroCostProof([WORKERS_AI_TRANSCRIPTION_MODEL]),
    AI:{
      async run(model,input){
        calls.push({model,input});
        return {text:'Bonjour, ceci est une note vocale.',word_count:6};
      },
    },
  };
  const file=new File([source],'note.wav',{type:'audio/wav'});
  const response=await handleFileUpload(uploadRequest(file),env,{authorized:true});
  const body=await response.json();

  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].model,WORKERS_AI_TRANSCRIPTION_MODEL);
  assert.deepEqual(Buffer.from(calls[0].input.audio,'base64'),Buffer.from(source));
  assert.equal(calls[0].input.task,'transcribe');
  assert.equal(calls[0].input.vad_filter,false);
  assert.equal(body.preview_text,'Bonjour, ceci est une note vocale.');
  assert.equal(body.analysis_status,'AUDIO_TRANSCRIBED');
  assert.equal(body.analysis_provider,WORKERS_AI_TRANSCRIPTION_MODEL);
});


test('parallel exact-SHA MEL-FILE proof upload is accepted only with matching token payload and deployed SHA', async () => {
  const token='p'.repeat(48);
  const sha='a'.repeat(40);
  const env={
    ...MEDIA_ENV,
    MELITURGOS_USER:'adrien',
    MELITURGOS_PASSWORD:'owner-secret',
    MEL_PARALLEL_PROOF_TOKEN:token,
    MEL_DEPLOYED_GIT_SHA:sha,
    MEDIA_BUCKET:{async put(){return undefined;}},
  };
  const form=new FormData();
  form.append('file',new File([
    new TextEncoder().encode('MEL_FILE_NORMAL_PROOF_'+sha)
  ],'mel-file-normal-proof.txt',{type:'text/plain'}));
  const request=new Request('https://mel.test/api/files/upload',{
    method:'POST',
    headers:{'x-mel-release-smoke':'1','x-mel-parallel-proof':token},
    body:form,
  });
  const response=await handleFileUpload(request,env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.stored,true);
  assert.match(String(body.preview_text||''),new RegExp('MEL_FILE_NORMAL_PROOF_'+sha));
});

test('parallel MEL-FILE proof rejects a payload for a different deployed SHA', async () => {
  const token='q'.repeat(48);
  const deployed='b'.repeat(40);
  const other='c'.repeat(40);
  const env={
    ...MEDIA_ENV,
    MELITURGOS_USER:'adrien',
    MELITURGOS_PASSWORD:'owner-secret',
    MEL_PARALLEL_PROOF_TOKEN:token,
    MEL_DEPLOYED_GIT_SHA:deployed,
    MEDIA_BUCKET:{async put(){return undefined;}},
  };
  const form=new FormData();
  form.append('file',new File([
    new TextEncoder().encode('MEL_FILE_NORMAL_PROOF_'+other)
  ],'mel-file-normal-proof.txt',{type:'text/plain'}));
  const request=new Request('https://mel.test/api/files/upload',{
    method:'POST',
    headers:{'x-mel-release-smoke':'1','x-mel-parallel-proof':token},
    body:form,
  });
  const response=await handleFileUpload(request,env);
  const body=await response.json();
  assert.equal(response.status,403);
  assert.equal(body.code,'MEL_FILE_PROOF_PAYLOAD_INVALID');
});
