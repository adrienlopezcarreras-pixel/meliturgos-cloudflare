import test from 'node:test';
import assert from 'node:assert/strict';
import {readR2AccountUsage} from '../../scripts/ops/r2-account-usage.mjs';
const credentials={accountId:'a'.repeat(32),apiToken:'PRIVATE_TOKEN'};
const payload=result=>new Response(JSON.stringify({success:true,result}));

test('R2 account metrics use one fixed-origin authenticated GET and whitelist numeric dimensions',async()=>{
 let calls=0;
 const result=await readR2AccountUsage({...credentials,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/r2/metrics');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer PRIVATE_TOKEN');
  return payload({standard:{published:{objects:10,payloadSize:123,metadataSize:4,private:'PRIVATE_SOURCE'},uploaded:{payloadSize:5}},infrequentAccess:{published:{objects:1,payloadSize:2}}});
 }});
 assert.equal(calls,1);assert.equal(result.ok,true);assert.equal(result.may_be_delayed,true);
 assert.equal(result.classes.standard.published.payloadSize,123);assert.equal(result.classes.standard.uploaded.payloadSize,5);
 assert.equal(result.billing_verified,false);assert.equal(result.cleanup_authorized,false);
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});

test('missing credentials never trigger a network call',async()=>{
 const result=await readR2AccountUsage({fetchImpl:()=>{throw Error('NETWORK_FORBIDDEN');}});
 assert.equal(result.code,'R2_USAGE_CREDENTIALS_REQUIRED');
});

test('provider errors and credentials never appear in usage evidence',async()=>{
 for(const status of [401,403,429,500]){
  const result=await readR2AccountUsage({...credentials,fetchImpl:async()=>new Response('PRIVATE_ERROR',{status})});
  assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 }
 const failure=await readR2AccountUsage({...credentials,fetchImpl:async()=>{throw Error('PRIVATE_URL_AND_TOKEN');}});
 assert.equal(failure.code,'R2_USAGE_TRANSPORT_OR_DATA_FAILED');assert.equal(JSON.stringify(failure).includes('PRIVATE'),false);
});

test('absent, invalid and oversized metrics do not become zero usage',async()=>{
 for(const result of [{},{standard:{}},{standard:{published:{payloadSize:-1}}},{standard:{published:{payloadSize:'0'}}},{standard:{published:{payloadSize:Infinity}}}]){
  const out=await readR2AccountUsage({...credentials,fetchImpl:async()=>payload(result)});
  assert.equal(out.ok,false);assert.equal(out.billing_verified,false);
 }
 const large=await readR2AccountUsage({...credentials,fetchImpl:async()=>new Response(' '.repeat(65537))});
 assert.equal(large.code,'R2_USAGE_RESPONSE_TOO_LARGE');
 const zero=await readR2AccountUsage({...credentials,fetchImpl:async()=>payload({standard:{published:{objects:0,payloadSize:0,metadataSize:0}}})});
 assert.equal(zero.ok,true);assert.equal(zero.classes.standard.published.payloadSize,0);
});
