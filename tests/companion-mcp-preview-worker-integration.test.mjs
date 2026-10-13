import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import worker from '../src/preview/companion-mcp-worker.js';

test('isolated Worker: signed OAuth token, D1 grant, status and revocation',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'preview-test',use:'sig',alg:'RS256'};
 const now=Math.floor(Date.now()/1000);
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const header=encode({alg:'RS256',typ:'JWT',kid:'preview-test'});
 const payload=encode({iss:'https://issuer.example.test',aud:'mel-companion-mcp',sub:'owner-1',iat:now-5,exp:now+120,scope:'companion:status:read'});
 const token=header+'.'+payload+'.'+sign('RSA-SHA256',Buffer.from(header+'.'+payload),privateKey).toString('base64url');
 let revoked=false,grantEnabled=true,reads=0;
 const db={prepare:sql=>({bind:(first,second)=>({first:async()=>{
  if(sql.includes('companion_mcp_token_revocations'))return revoked?{token_hash:first}:null;
  if(sql.includes('companion_mcp_device_grants'))return grantEnabled&&first==='owner-1'&&second==='win-1'?{owner_subject:first,device_id:second,revoked:0,expires_at:Date.now()+100000,paired_id:second}:null;
  if(sql.includes('FROM computer_devices')){reads++;return {id:first,halted:0,last_seen_at:Date.now()-1000,token_hash:'DO_NOT_EXPOSE'};}
  throw Error('Unexpected SQL');
 }})})};
 const env={MCP_PREVIEW_ENABLED:'true',MCP_PREVIEW_ISOLATED:'true',MCP_PREVIEW_D1_ISOLATED:'true',MCP_PREVIEW_WORKER_NAME:'mcp-preview',MCP_PRODUCTION_WORKER_NAME:'mel-prod',MCP_PREVIEW_D1_DATABASE_ID:'d1-preview',MCP_PRODUCTION_D1_DATABASE_ID:'d1-prod',MCP_PREVIEW_ORIGIN:'https://preview.example.test',MCP_OAUTH_ISSUER:'https://issuer.example.test',MCP_OAUTH_JWKS:JSON.stringify({keys:[jwk]}),DB:db};
 const request=()=>new Request('https://preview.example.test/mcp/companion/v1',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'mel_companion_status',arguments:{computer_id:'win-1'}}})});
 const response=await worker.fetch(request(),env);
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(JSON.parse(result.result.content[0].text).online,true);
 assert.equal(JSON.stringify(result).includes('DO_NOT_EXPOSE'),false);
 grantEnabled=false;
 assert.equal((await worker.fetch(request(),env)).status,403);
 assert.equal(reads,1);
 grantEnabled=true;revoked=true;
 assert.equal((await worker.fetch(request(),env)).status,401);
 assert.equal(reads,1);
});
