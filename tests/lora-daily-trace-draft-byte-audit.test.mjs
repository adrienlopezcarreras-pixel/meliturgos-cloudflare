import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyByteStream,hashGithubAsset,auditC000DraftAssets,ASSETS,TAG,SOURCE} from '../scripts/audit-c000-draft-release-assets.mjs';

const payload=Buffer.from('known-offline-test-bytes');
const expected={size:payload.length,sha256:createHash('sha256').update(payload).digest('hex')};

test('offline streaming digest matches exact bytes without writing a file',async()=>{
  const r=await verifyByteStream(new Response(payload,{headers:{'content-type':'application/octet-stream'}}),expected);
  assert.deepEqual(r,{ok:true,code:'DRAFT_ASSET_BYTES_VERIFIED',bytes:payload.length});
});
test('modified bytes, oversize bytes, and JSON metadata are never accepted as weights',async()=>{
  let r=await verifyByteStream(new Response(Buffer.from('wrong-offline-test-bytes')),expected);
  assert.equal(r.code,'DRAFT_ASSET_SHA256_OR_SIZE_MISMATCH');
  r=await verifyByteStream(new Response(Buffer.concat([payload,Buffer.from('extra')])),expected);
  assert.equal(r.code,'DRAFT_ASSET_SIZE_OVERFLOW');
  r=await verifyByteStream(new Response('{"id":7}',{headers:{'content-type':'application/json'}}),expected);
  assert.equal(r.code,'DRAFT_ASSET_BINARY_DOWNLOAD_FAILED');
});
test('only known asset names and numeric IDs may be fetched',async()=>{
  let fetched=false;
  const fetchImpl=async()=>{fetched=true;throw Error('MUST_NOT_FETCH');};
  const result=await hashGithubAsset({
    asset:{name:'unapproved-asset',id:123,size:5},token:'test',fetchImpl,
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,'DRAFT_ASSET_METADATA_INVALID');
  assert.equal(fetched,false);
});
test('untrusted redirect cannot leak token to foreign host',async()=>{
  const asset={name:'checkpoint-draft-proof.json',id:123,size:ASSETS['checkpoint-draft-proof.json'].size};
  const urls=[];
  const fetchImpl=async(url,init)=>{
    urls.push({url,auth:init.headers?.Authorization});
    return new Response(null,{status:302,headers:{Location:'https://evil.example/asset'}});
  };
  const r=await hashGithubAsset({asset,token:'test-secret-do-not-print',fetchImpl});
  assert.equal(r.code,'DRAFT_ASSET_REDIRECT_REJECTED');
  assert.equal(urls.length,1);
  assert.match(urls[0].url,/^https:\/\/api\.github\.com/);
});
test('API must not mistake a public release for a valid private draft',async()=>{
  const draft={tag_name:TAG,target_commitish:SOURCE,draft:false,assets:[
    {name:'mel-lora-bundle.tar.gz',id:1,size:ASSETS['mel-lora-bundle.tar.gz'].size},
    {name:'checkpoint-draft-proof.json',id:2,size:ASSETS['checkpoint-draft-proof.json'].size},
  ]};
  let calls=0;
  const result=await auditC000DraftAssets({token:'fake',fetchImpl:async()=>{
    calls++;
    return Response.json([draft]);
  }});
  assert.equal(result.code,'DRAFT_RELEASE_PROVENANCE_INVALID');
  assert.equal(calls,1);
});
test('missing token fails before any API request',async()=>{
  let calls=0;
  const result=await auditC000DraftAssets({token:'',fetchImpl:async()=>{
    calls++;throw Error('SHOULD_NOT_CALL');
  }});
  assert.equal(result.code,'DRAFT_ASSET_TOKEN_MISSING');
  assert.equal(calls,0);
});
