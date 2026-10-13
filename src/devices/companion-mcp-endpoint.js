// Non-mounted MCP assembly. D1 owner grants and OAuth revocation are mandatory.
import {companionMcpHttp} from './companion-mcp-http.js';
import {makeCompanionMcpAuthenticator} from './companion-mcp-authenticator.js';
import {createCompanionDeviceAuthorization} from './companion-mcp-device-authorization.js';
import {makeCompanionD1DeviceLookup} from './companion-mcp-d1-lookup.js';

export function createCompanionMcpEndpoint({issuer,jwks,revoked,db,readStatus}={}){
 if(typeof readStatus!=='function')throw new Error('MCP_STATUS_PROVIDER_REQUIRED');
 const lookupOwnerDevice=makeCompanionD1DeviceLookup(db);
 const authorizeDevice=createCompanionDeviceAuthorization({lookupOwnerDevice});
 const authenticate=makeCompanionMcpAuthenticator({issuer,jwks,revoked});
 return request=>companionMcpHttp(request,{authenticate,authorizeDevice,readStatus});
}
