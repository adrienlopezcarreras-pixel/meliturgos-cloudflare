import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFileUpload, expiredMediaKeys } from '../src/api/file-upload.js';

const MEDIA_KEY_B64=Buffer.alloc(32,7).toString('base64');
const MEDIA_ENV={MEL_MEDIA_ENCRYPTION_KEY_ID:'media-v1',MEL_MEDIA_ENCRYPTION_KEY_B64:MEDIA_KEY_B64};
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


test('private media upload exposes SHA-256 and bounded retention metadata', async()=>{
  let storedMetadata=null;
  const response=await handleFileUpload(
    request('evidence.bin','application/octet-stream',new Uint8Array([1,2,3,4])),
    {...MEDIA_ENV,{
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'test',
      MEL_MEDIA_TTL_SECONDS:'3600',
      MEDIA_BUCKET:{
        async put(_key,_bytes,options){ storedMetadata=options?.customMetadata||null; }
      }
    }
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.match(body.sha256,/^[0-9a-f]{64}$/);
  assert.equal(body.stored,true);
  assert.equal(body.ttl_seconds,3600);
  assert.ok(Date.parse(body.expires_at)>Date.parse(body.created_at));
  assert.equal(storedMetadata.sha256,body.sha256);
  assert.equal(storedMetadata.expiresAt,body.expires_at);
});

test('media retention configuration is clamped and only advertised for persisted uploads', async()=>{
  const response=await handleFileUpload(
    request('note.txt','text/plain','bonjour'),
    {MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',MEL_MEDIA_TTL_SECONDS:'1'}
  );
  const body=await response.json();
  assert.match(body.sha256,/^[0-9a-f]{64}$/);
  assert.equal(body.stored,false);
  assert.equal(body.expires_at,null);
  assert.equal(body.ttl_seconds,null);
});


test('expired media selection only returns objects whose declared retention elapsed', ()=>{
  const now=Date.parse('2026-09-30T22:00:00Z');
  const keys=expiredMediaKeys([
    {key:'uploads/old.bin',customMetadata:{expiresAt:'2026-09-30T21:59:59Z'}},
    {key:'uploads/future.bin',customMetadata:{expiresAt:'2026-10-01T00:00:00Z'}},
    {key:'uploads/legacy.bin',customMetadata:{}},
  ],now);
  assert.deepEqual(keys,['uploads/old.bin']);
});
