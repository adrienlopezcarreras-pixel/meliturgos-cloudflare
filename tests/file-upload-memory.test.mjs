import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleFileUpload } from '../src/api/file-upload.js';

test('private file upload returns sha256, extracted text and bounded provenance metadata', async () => {
  const writes=[];
  const form=new FormData();
  const sourceText='Archive MEL attachment bytes: zebracactus.';
  form.append('file',new Blob([sourceText],{type:'text/plain'}),'historique.txt');
  form.append('source','chatgpt_attachment');
  form.append('conversation_id','conversation-123');
  form.append('message_id','message-456');
  form.append('attachment_id','attachment-789');

  const auth='Basic '+Buffer.from('adrien:test').toString('base64');
  const request=new Request('https://mel.test/api/files/upload',{
    method:'POST',
    headers:{authorization:auth},
    body:form
  });
  const env={
    MELITURGOS_USER:'adrien',
    MELITURGOS_PASSWORD:'test',
    MEDIA_BUCKET:{
      async put(key,bytes,options){writes.push({key,bytes:new Uint8Array(bytes),options});}
    }
  };

  const response=await handleFileUpload(request,env);
  assert.equal(response.status,200);
  const body=await response.json();
  const expected=createHash('sha256').update(sourceText).digest('hex');

  assert.equal(body.ok,true);
  assert.equal(body.stored,true);
  assert.equal(body.private,true);
  assert.equal(body.sha256,expected);
  assert.equal(body.analysis_status,'TEXT_EXTRACTED');
  assert.match(body.preview_text,/zebracactus/);
  assert.equal(writes.length,1);
  assert.equal(writes[0].options.customMetadata.sha256,expected);
  assert.equal(writes[0].options.customMetadata.source,'chatgpt_attachment');
  assert.equal(writes[0].options.customMetadata.conversationId,'conversation-123');
  assert.equal(writes[0].options.customMetadata.messageId,'message-456');
  assert.equal(writes[0].options.customMetadata.attachmentId,'attachment-789');

  assert.match(body.key,/^uploads\/chatgpt\/attachment-789-/);

  const retryForm=new FormData();
  retryForm.append('file',new Blob([sourceText],{type:'text/plain'}),'historique.txt');
  retryForm.append('source','chatgpt_attachment');
  retryForm.append('conversation_id','conversation-123');
  retryForm.append('message_id','message-456');
  retryForm.append('attachment_id','attachment-789');
  const retryRequest=new Request('https://mel.test/api/files/upload',{
    method:'POST',
    headers:{authorization:auth},
    body:retryForm
  });
  const retryResponse=await handleFileUpload(retryRequest,env);
  const retryBody=await retryResponse.json();
  assert.equal(retryBody.key,body.key);
  assert.equal(retryBody.id,body.id);
  assert.equal(retryBody.sha256,body.sha256);
  assert.equal(writes.length,2);
  assert.equal(writes[1].key,writes[0].key);
});
