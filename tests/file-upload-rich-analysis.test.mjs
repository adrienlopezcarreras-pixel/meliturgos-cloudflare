import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFileUpload } from '../src/api/file-upload.js';

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
