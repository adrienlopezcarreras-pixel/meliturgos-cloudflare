import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createCompanionMcpEndpoint} from '../src/devices/companion-mcp-endpoint.js';

test('signed token plus D1 grant permits only scoped Companion status',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'integration-key',use:'sig',alg:'RS256'};
 const now=Math.floor(Date.now()/1000);
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const h=b64({alg:'RS256',typ:'JWT',kid:'integration-key'});
 const p=b64({iss:'https://issuer.example.test',aud:'mel-companion-mcp',sub:'owner-1',iat:now-5,exp:now+300,scope:'companion:status:read'});
 const token=h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
 let grantRevoked=0;
 let grantExpiresAt=Date.now()+300000;
 const db={prepare:sql=>({bind:(a,b)=>({first:async()=>{
  if(sql.includes('companion_mcp_device_grants'))return a==='owner-1'&&b==='win-1'?{owner_subject:a,device_id:b,revoked:grantRevoked,expires_at:grantExpiresAt,paired_id:b}:null;
  if(sql.includes('FROM computer_devices'))return a==='win-1'?{id:a,halted:0,last_seen_at:Date.now()-1000,metadata:'UNSAFE'}:null;
  throw Error('Unexpected SQL');
 }})})};
 const endpoint=createCompanionMcpEndpoint({
  allowedOrigin:'https://mel.example.test',issuer:'https://issuer.example.test',jwks:{keys:[jwk]},revoked:async()=>false,db,
 });
 const call=async id=>endpoint(new Request('https://mel.example.test/mcp/companion/v1',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:id}}})
 }));
 const allowed=await call('win-1');
 assert.equal(allowed.status,200);
 const payload=await allowed.json();
 const status=JSON.parse(payload.result.content[0].text);
 assert.equal(status.online,true);
 assert.equal(status.id,'win-1');
 assert.equal(JSON.stringify(payload).includes('UNSAFE'),false);
 assert.equal((await call('win-2')).status,403);
 grantRevoked=1;
 assert.equal((await call('win-1')).status,403);
 grantRevoked=0;
 grantExpiresAt=Date.now()-1000;
 assert.equal((await call('win-1')).status,403);
 // A revoked grant must not revive merely because its expiration is changed.
 grantRevoked=1;
 grantExpiresAt=Date.now()+300000;
 assert.equal((await call('win-1')).status,403);
});
