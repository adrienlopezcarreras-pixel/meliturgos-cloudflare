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
 const db={prepare:()=>({bind:(owner,id)=>({first:async()=>owner==='owner-1'&&id==='win-1'?{owner_subject:owner,device_id:id,revoked:0,expires_at:Date.now()+300000,paired_id:id}:null})})};
 const endpoint=createCompanionMcpEndpoint({
  allowedOrigin:'https://mel.example.test',issuer:'https://issuer.example.test',jwks:{keys:[jwk]},revoked:async()=>false,db,
  readStatus:async(_principal,id)=>({id,online:true,halted:false,last_seen_at:Date.now(),private_data:'UNSAFE'})
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
});
