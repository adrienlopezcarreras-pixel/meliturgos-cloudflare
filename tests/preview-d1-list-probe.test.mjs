import test from 'node:test';
import assert from 'node:assert/strict';
import { probePreviewD1List } from '../scripts/probe-preview-d1-list.mjs';
const accountId='a'.repeat(32), databaseId='22222222-2222-2222-2222-222222222222', apiToken='secret-token';
const payload=(result, total=result.length)=>({ok:true,status:200,json:async()=>({success:true,result,result_info:{total_count:total}})});
const options={accountId,databaseId,apiToken};

test('only a read-only GET is sent to the configured account and identities are not logged', async()=>{
  let calls=0;
  const code=await probePreviewD1List({...options,fetchImpl:async(url,params)=>{
    calls++;
    assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database?per_page=10000`);
    assert.equal(params.method,'GET');
    assert.equal(params.redirect,'error');
    assert.equal(params.headers.Authorization,'Bearer '+apiToken);
    return payload([{uuid:databaseId}]);
  }});
  assert.equal(calls,1);assert.equal(code,'PREVIEW_D1_LIST_MATCH_VERIFIED');
});
test('distinguishes a full authorized account list missing the target from denied D1 listing',async()=>{
  const missing=await probePreviewD1List({...options,fetchImpl:async()=>payload([{uuid:'other'}])});
  assert.equal(missing,'PREVIEW_D1_LIST_TARGET_NOT_IN_ACCOUNT');
  const denied=await probePreviewD1List({...options,fetchImpl:async()=>({ok:false,status:403,json:async()=>({success:false,errors:[{code:7403,message:'private-token'}]})})});
  assert.equal(denied,'PREVIEW_D1_LIST_ACCESS_DENIED');
});
test('never calls an incomplete first page a missing database',async()=>{
  const result=await probePreviewD1List({...options,fetchImpl:async()=>payload([],1)});
  assert.equal(result,'PREVIEW_D1_LIST_INCOMPLETE');
});
test('network errors are redacted and fail closed',async()=>{
  const result=await probePreviewD1List({...options,fetchImpl:async()=>{throw Error(apiToken)}});
  assert.equal(result,'PREVIEW_D1_LIST_NETWORK_FAILED');
});
