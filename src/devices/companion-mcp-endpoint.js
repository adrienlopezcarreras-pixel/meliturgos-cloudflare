// Explicitly injectable assembly. Not mounted onto production routes.
// Operator supplies reviewed OAuth issuer/JWKS, fail-closed revocation and device ACL.
import {companionMcpHttp} from './companion-mcp-http.js';
import {makeCompanionMcpAuthenticator} from './companion-mcp-authenticator.js';

export function createCompanionMcpEndpoint({issuer,jwks,revoked,authorizeDevice,readStatus}={}){
 if(typeof authorizeDevice!=='function'||typeof readStatus!=='function')
  throw new Error('MCP_DEVICE_BINDING_REQUIRED');
 const authenticate=makeCompanionMcpAuthenticator({issuer,jwks,revoked});
 return request=>companionMcpHttp(request,{authenticate,authorizeDevice,readStatus});
}
