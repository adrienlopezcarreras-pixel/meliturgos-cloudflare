import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFileUpload } from '../src/api/file-upload.js';

const auth='Basic '+Buffer.from('adrien:test').toString('base64');
function request(name,type,data){
  const form=new FormData();
  form.append('file',new Blob([data],{type}),name);
  return new Request('https://mel.test/api/files/upload',{method:'POST',headers:{authorization:auth},body:form});
}

test('canonical file upload extracts bounded text without executing it', async()=>{
  globalThis.__mel_file_executed=undefined;
  const response=await handleFileUpload(
    request('note.js','application/javascript','globalThis.__mel_file_executed=true;\nbonjour MEL'),
    {MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'}
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.analysis_status,'TEXT_EXTRACTED');
  assert.match(body.preview_text,/bonjour MEL/);
  assert.equal(globalThis.__mel_file_executed,undefined);
  assert.equal(body.private,true);
  assert.equal(body.stored,false);
});

test('oversized files fail closed', async()=>{
  const response=await handleFileUpload(
    request('huge.bin','application/octet-stream',new Uint8Array(25_000_001)),
    {MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'}
  );
  assert.equal(response.status,413);
  assert.equal((await response.json()).code,'FILE_TOO_LARGE');
});
