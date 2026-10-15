import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleAuthorizedGpuNodes as eligible,invokeWithOptionalRemoteGpu as run} from '../../src/portability/authorized-remote-gpu-routing.js';
const node={id:'gpu-volunteer-1',kind:'volunteer-node',permission_basis:'volunteer-consent',permission_verified:true,
 free_tier_verified:true,cost_hard_limit_usd:0,online:true,last_checked_at:100000,latency_ms:90};
test('only explicitly authorized, free, fresh and public GPU nodes are eligible',()=>{
 assert.equal(eligible([node],{now:100200}).length,1);
 for(const change of [
  {permission_verified:false},{permission_basis:null},{free_tier_verified:false},
  {cost_hard_limit_usd:0.01},{online:false},{last_checked_at:39999},{id:'https://other-host'},
  {kind:'unknown'}])
   assert.equal(eligible([{...node,...change}],{now:100200}).length,0);
 assert.equal(eligible([node],{now:100200,classification:'private'}).length,0);
});
test('disabled, no consent, private payload and provider failures always fall back',async()=>{
 let sent=0,primary=0;
 const fallback=()=>{primary++;return{text:'mel-primary'}};
 const invokeRemote=async()=>{sent++;return{ok:true,text:'gpu-response'}};
 for(const opts of [
   {enabled:false,ownerConsent:true,classification:'public'},
   {enabled:true,ownerConsent:false,classification:'public'},
   {enabled:true,ownerConsent:true,classification:'private'},
   {enabled:true,ownerConsent:true,classification:'public',nodes:[{...node,permission_verified:false}]}
 ])assert.equal((await run({...opts,request:'question',nodes:opts.nodes??[node],now:100200,invokeRemote,fallback})).text,'mel-primary');
 assert.equal(sent,0);assert.equal(primary,4);
 assert.equal((await run({enabled:true,ownerConsent:true,classification:'public',nodes:[node],now:100200,invokeRemote,fallback})).text,'gpu-response');
 assert.equal(sent,1);
 assert.equal((await run({enabled:true,ownerConsent:true,classification:'public',nodes:[node],now:100200,invokeRemote:async()=>{throw Error('offline')},fallback})).text,'mel-primary');
});

test('remote GPU timeout aborts and returns to MEL primary',async()=>{
 let aborted=false;
 const fallback=()=>({text:'primary-after-timeout'});
 const result=await run({enabled:true,ownerConsent:true,classification:'public',nodes:[node],now:100200,
   timeoutMs:8,request:'public-question',
   invokeRemote:({signal})=>new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve({ok:false});},{once:true})),
   fallback
 });
 assert.equal(result.text,'primary-after-timeout');
 assert.equal(aborted,true);
});
