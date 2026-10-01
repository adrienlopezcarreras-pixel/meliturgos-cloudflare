import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleFileUpload } from '../src/api/file-upload.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';

const MEDIA_KEY_B64=Buffer.alloc(32,7).toString('base64');
const MEDIA_ENV={MEL_MEDIA_ENCRYPTION_KEY_ID:'media-v1',MEL_MEDIA_ENCRYPTION_KEY_B64:MEDIA_KEY_B64};
test('normal UI offers one generic multi-file drop surface without pretending local video analysis', async()=>{
  const source=await readFile(new URL('../src/pages/mvp-interface-v3.js',import.meta.url),'utf8');
  assert.match(source,/id="fileInput" type="file" multiple/);
  assert.match(source,/Glisse un fichier ici/);
  assert.match(NORMAL_RUNTIME_SOURCE,/\/api\/files\/upload/);
  assert.doesNotMatch(source,/<video[^>]*controls/);
  assert.doesNotMatch(NORMAL_RUNTIME_SOURCE,/URL\.createObjectURL/);
});

test('binary upload stays private and uses R2 only when the binding exists', async()=>{
  let puts=0;
  let storedBytes=null;
  const form=new FormData();
  form.append('file',new Blob(['binary'],{type:'application/octet-stream'}),'archive.xyz');
  const request=new Request('https://mel.test/api/files/upload',{
    method:'POST',
    headers:{authorization:'Basic '+Buffer.from('adrien:test').toString('base64')},
    body:form
  });
  const response=await handleFileUpload(request,{...MEDIA_ENV,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',MEDIA_BUCKET:{async put(_key,bytes){puts++;storedBytes=new Uint8Array(bytes);}}
  });
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.private,true);
  assert.equal(body.stored,true);
  assert.equal(body.stored_encrypted,true);
  assert.equal(body.encryption.algorithm,'AES-GCM-256');
  assert.notEqual(new TextDecoder().decode(storedBytes),'binary');
  assert.equal(body.url,null);
  assert.equal(puts,1);
});
