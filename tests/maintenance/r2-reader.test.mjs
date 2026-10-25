import test from 'node:test';
import assert from 'node:assert/strict';
import {createR2BackupReader} from '../../release-tools/predeploy-backup-refresh/r2-reader.mjs';
const credentials={accountId:'a'.repeat(32),apiToken:'PRIVATE_SENTINEL'};

test('native reader uses the same fixed authenticated GET endpoint and reads exact backup bytes',async()=>{
 let calls=0;
 const reader=createR2BackupReader({...credentials,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+credentials.accountId+'/r2/buckets/meliturgos-private-media/objects/backups/system/a%20b%3F.enc.json');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  assert.equal(options.headers.authorization,'Bearer PRIVATE_SENTINEL');return new Response(new Uint8Array([0,255,3]));
 }});
 assert.deepEqual(await reader.getBytes('backups/system/a b?.enc.json'),Buffer.from([0,255,3]));assert.equal(calls,1);
});
test('reader refuses missing credentials, namespace escapes and excessive read budgets before network access',async()=>{
 assert.throws(()=>createR2BackupReader({}),/CREDENTIALS_REQUIRED/);let calls=0;
 const reader=createR2BackupReader({...credentials,fetchImpl:async()=>{calls++;}});
 for(const key of ['media/private','backups/system/../private','backups/system/./x'])await assert.rejects(reader.getBytes(key),/KEY_INVALID/);
 await assert.rejects(reader.getBytes('backups/system/x',{maxBytes:513*1024*1024}),/READ_BUDGET_INVALID/);
 assert.equal(calls,0);
});
test('size limits cover declared and streaming body sizes',async()=>{
 for(const headers of [{},{'content-length':'3'}]){
  const reader=createR2BackupReader({...credentials,fetchImpl:async()=>new Response('abc',{headers})});
  await assert.rejects(reader.getBytes('backups/system/x',{maxBytes:2}),/READ_BUDGET_EXCEEDED/);
 }
});
test('access denial and missing copies remain explicit without provider body disclosure',async()=>{
 const denied=createR2BackupReader({...credentials,fetchImpl:async()=>new Response('PRIVATE_PROVIDER_BODY',{status:403})});
 await assert.rejects(denied.getBytes('backups/system/x'),error=>{assert.equal(error.code,'ISOLATED_R2_ACCESS_DENIED');assert.doesNotMatch(String(error),/PRIVATE/);return true;});
 assert.equal(await createR2BackupReader({...credentials,fetchImpl:async()=>new Response(null,{status:404})}).getBytes('backups/system/x'),null);
});
test('rate limits honor Retry-After with bounded retry and no real sleep',async()=>{
 let time=0,calls=0;const delays=[];
 const reader=createR2BackupReader({...credentials,now:()=>time,sleep:async ms=>{delays.push(ms);time+=ms;},fetchImpl:async()=>++calls===1?new Response(null,{status:429,headers:{'retry-after':'2'}}):new Response('ok')});
 assert.equal((await reader.getBytes('backups/system/x')).toString(),'ok');assert.equal(calls,2);assert.deepEqual(delays,[2000]);
 let rejected=0;
 const blocked=createR2BackupReader({...credentials,sleep:async()=>{},fetchImpl:async()=>{rejected++;return new Response(null,{status:429,headers:{'retry-after':'301'}});}});
 await assert.rejects(blocked.getBytes('backups/system/x'),/RATE_LIMITED/);assert.equal(rejected,1);
});

test('zero-byte objects remain real empty data, distinct from missing objects',async()=>{
 const reader=createR2BackupReader({...credentials,fetchImpl:async()=>new Response(null,{headers:{'content-length':'0'}})});
 assert.deepEqual(await reader.getBytes('backups/system/empty',{maxBytes:0}),Buffer.alloc(0));
});
