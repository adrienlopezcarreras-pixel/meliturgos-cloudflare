import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverCompanionOAuthIssuer} from '../src/preview/companion-mcp-oauth-discovery.js';
const issuer='https://issuer.example.test';
const metadata={issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',code_challenge_methods_supported:['S256'],response_types_supported:['code'],grant_types_supported:['authorization_code'],token_endpoint_auth_methods_supported:['none']};
test('reads pinned HTTPS OAuth metadata without following redirects',async()=>{
 let checked=false;
 const result=await discoverCompanionOAuthIssuer({issuer,fetcher:async(url,options)=>{
  checked=url===issuer+'/.well-known/oauth-authorization-server'&&options.redirect==='manual';
  return new Response(JSON.stringify(metadata),{headers:{'content-type':'application/json'}});
 }});
 assert.equal(checked,true);
 assert.equal(result.pkce,'S256');
});
test('does not follow issuer redirects or accept mixed-origin metadata',async()=>{
 await assert.rejects(discoverCompanionOAuthIssuer({issuer,fetcher:async()=>new Response(null,{status:302,headers:{location:'https://attacker.invalid/'}})}),/MCP_ISSUER_DISCOVERY_DENIED/);
 await assert.rejects(discoverCompanionOAuthIssuer({issuer,fetcher:async()=>Response.json({...metadata,issuer:'https://attacker.invalid'})}),/MCP_ISSUER_MISMATCH/);
});

test('pathful issuer uses RFC8414 well-known insertion',async()=>{
 const pathIssuer='https://issuer.example.test/tenant/a';
 let requested='';
 await discoverCompanionOAuthIssuer({issuer:pathIssuer,fetcher:async url=>{
  requested=url;
  return Response.json({...metadata,issuer:pathIssuer});
 }});
 assert.equal(requested,'https://issuer.example.test/.well-known/oauth-authorization-server/tenant/a');
});
test('discovery refuses issuer URL credentials',async()=>{
 await assert.rejects(discoverCompanionOAuthIssuer({issuer:'https://user:secret@issuer.example.test'}),/MCP_ISSUER_CONFIG_INVALID/);
});
