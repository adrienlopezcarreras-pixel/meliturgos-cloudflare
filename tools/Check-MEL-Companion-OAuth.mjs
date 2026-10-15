#!/usr/bin/env node
// Read-only provider discovery: does not deploy, register clients, or print tokens.
import {discoverCompanionOAuthIssuer} from '../src/preview/companion-mcp-oauth-discovery.js';
const issuer=process.env.MCP_OAUTH_ISSUER;
if(!issuer){console.error('MCP_OAUTH_ISSUER is required');process.exitCode=2;}
else{
 try{
  const result=await discoverCompanionOAuthIssuer({issuer});
  console.log(JSON.stringify({ok:true,issuer:result.issuer,authorization_endpoint:result.authorization_endpoint,token_endpoint:result.token_endpoint,jwks_uri:result.jwks_uri,pkce:result.pkce},null,2));
 }catch(err){
  console.error('OAuth provider preflight failed:',err?.message||'UNKNOWN');
  process.exitCode=1;
 }
}
