import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFileUpload } from '../src/api/file-upload.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { onRequestGet as fullInterface } from '../src/pages/full-interface-v2.js';

const env = { MELITURGOS_USER:'test', MELITURGOS_PASSWORD:'test-only', AI:{
  toMarkdown(){ throw Error('video must not be converted to document or image') },
  run(){ throw Error('video must not trigger audio transcription') },
} };
async function upload(name,type) {
  const form=new FormData();
  form.append('file',new Blob(['short-media'],{type}),name);
  const req=new Request('https://mel.test/api/files/upload',{method:'POST',headers:{authorization:'Basic '+btoa('test:test-only')},body:form});
  const response=await handleFileUpload(req,env);
  assert.equal(response.status,200);
  return response.json();
}

test('MP4 and WebM videos are classified as unanalysed video and not audio transcripts',async()=>{
  for(const [name,type] of [['clip.mp4','video/mp4'],['camera.webm','video/webm'],['capture.mp4','application/octet-stream']]){
    const result=await upload(name,type);
    assert.equal(result.analysis_status,'VIDEO_RECEIVED_UNANALYZED',name);
    assert.equal(result.preview_text,null,name);
    assert.equal(result.analysis_provider,null,name);
    assert.equal(result.private,true);
    assert.equal(result.url,null);
  }
});

test('audio MIME wins over ambiguous MP4 or WebM filename',async()=>{
  const result=await upload('memo.webm','audio/webm');
  assert.notEqual(result.analysis_status,'VIDEO_RECEIVED_UNANALYZED');
  assert.equal(result.preview_text,null);
});

test('normal chat plays locally attached videos without disclosing an R2 URL',()=>{
  assert.match(NORMAL_RUNTIME_SOURCE,/function localPlayableMedia\(file\)/);
  assert.match(NORMAL_RUNTIME_SOURCE,/type\.startsWith\('video\/'\)/);
  assert.match(NORMAL_RUNTIME_SOURCE,/kind=item\.isVideo\?'video'/);
  assert.match(NORMAL_RUNTIME_SOURCE,/media\.controls=true/);
  assert.match(NORMAL_RUNTIME_SOURCE,/URL\.revokeObjectURL/);
  assert.match(NORMAL_RUNTIME_SOURCE,/vidéo non analysée/);
  assert.match(NORMAL_RUNTIME_SOURCE,/Ne prétends pas avoir visionné cette vidéo/);
});

test('full Code and Conversation chat support local playback with honest media status',async()=>{
  const response=await fullInterface();
  const html=await response.text();
  assert.match(html,/function localPlayableMedia\(file\)/);
  assert.match(html,/kind=item\.isVideo\?'video'/);
  assert.match(html,/URL\.revokeObjectURL/);
  assert.match(html,/media\.controls=true/);
  assert.match(html,/VIDEO_RECEIVED_UNANALYZED|Vidéo jointe \(non analysée\)/);
  assert.match(html,/Ne prétends pas avoir visionné cette vidéo/);
});
