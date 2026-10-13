// Independent bearer-auth boundary for remote MCP. No endpoint is mounted by this module.
import {verifyCompanionJwt} from './companion-mcp-oauth-jwt.js';
export function makeCompanionMcpAuthenticator({issuer,jwks,revoked}={}){
 if(typeof issuer!=='string'||!issuer.startsWith('https://')||!Array.isArray(jwks?.keys)||typeof revoked!=='function')
  throw Error('MCP_AUTH_CONFIG_INCOMPLETE');
 return async function authenticate(request){
  const header=request.headers.get('authorization')||'';
  const match=/^Bearer ([A-Za-z0-9._-]{1,8192})$/.exec(header);
  if(!match)throw Error('MCP_BEARER_REQUIRED');
  const principal=await verifyCompanionJwt(match[1],{issuer,jwks});
  // Revocation check must fail closed (including outages); subject alone is not a revocation key.
  const active=await revoked(match[1],principal);
  if(active!==false)throw Error('MCP_TOKEN_REVOKED_OR_UNVERIFIED');
  return principal;
 };
}
