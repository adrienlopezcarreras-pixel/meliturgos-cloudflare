// Explicitly injectable assembly. Not mounted onto production routes.
// Operator supplies reviewed OAuth issuer/JWKS, fail-closed revocation and owner-device lookup.
import {companionMcpHttp} from './companion-mcp-http.js';
import {makeCompanionMcpAuthenticator} from './companion-mcp-authenticator.js';
import {createCompanionDeviceAuthorization} from './companion-mcp-device-authorization.js';

export function createCompanionMcpEndpoint({issuer,jwks,revoked,lookupOwnerDevice,readStatus}={}){
 if(typeof readStatus!=='function')throw new Error('MCP_STATUS_PROVIDER_REQUIRED');
 const authorizeDevice=createCompanionDeviceAuthorization({lookupOwnerDevice});
 const authenticate=makeCompanionMcpAuthenticator({issuer,jwks,revoked});
 return request=>companionMcpHttp(request,{authenticate,authorizeDevice,readStatus});
}
