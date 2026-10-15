// Preview composition for real Cloudflare D1, deliberately NOT registered on any route.
// A reviewed issuer and JWKS must be installed in preview configuration first.
import {createCompanionMcpEndpoint} from './companion-mcp-endpoint.js';

export function createPreviewCompanionMcpHandler(env){
 const issuer=String(env?.MCP_OAUTH_ISSUER||'');
 const allowedOrigin=String(env?.MCP_PREVIEW_ORIGIN||'');
 let jwks;
 try {jwks=JSON.parse(env?.MCP_OAUTH_JWKS||'null');}catch{throw Error('MCP_JWKS_CONFIGURATION_INVALID');}
 if(!issuer.startsWith('https://')||!allowedOrigin.startsWith('https://')||
    !Array.isArray(jwks?.keys)||jwks.keys.length<1||jwks.keys.some(k=>k?.kty!=='RSA'||k?.alg!=='RS256'||k?.use!=='sig'||typeof k?.kid!=='string'||!k.kid||typeof k?.n!=='string'||typeof k?.e!=='string'||'d' in k)||typeof env?.DB?.prepare!=='function')
  throw Error('MCP_PREVIEW_CONFIGURATION_INCOMPLETE');
 const revoked=async fingerprint=>{
  const row=await env.DB.prepare('SELECT token_hash FROM companion_mcp_token_revocations WHERE token_hash=? LIMIT 1').bind(fingerprint).first();
  // Fail closed on unknown state or unavailable database.
  if(row==null)return false;
  return row.token_hash===fingerprint;
 };
 return createCompanionMcpEndpoint({issuer,allowedOrigin,jwks,db:env.DB,revoked});
}
