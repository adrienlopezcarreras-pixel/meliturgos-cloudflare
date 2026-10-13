// Non-mounted MCP assembly. D1 owner grants and OAuth revocation are mandatory.
import {companionMcpHttp} from './companion-mcp-http.js';
import {makeCompanionMcpAuthenticator} from './companion-mcp-authenticator.js';
import {createCompanionDeviceAuthorization} from './companion-mcp-device-authorization.js';
import {makeCompanionD1DeviceLookup} from './companion-mcp-d1-lookup.js';
import {makeCompanionD1StatusReader} from './companion-mcp-d1-status.js';
import {checkCompanionMcpTransport} from './companion-mcp-transport-gate.js';

export function createCompanionMcpEndpoint({issuer,jwks,revoked,db,allowedOrigin}={}){
 const readStatus=makeCompanionD1StatusReader(db);
 const lookupOwnerDevice=makeCompanionD1DeviceLookup(db);
 const authorizeDevice=createCompanionDeviceAuthorization({lookupOwnerDevice});
 const authenticate=makeCompanionMcpAuthenticator({issuer,jwks,revoked});
 return request=>{
  const gate=checkCompanionMcpTransport(request,{allowedOrigin});
  if(!gate.ok)return Response.json({error:gate.code},{status:gate.status,headers:{'cache-control':'no-store'}});
  return companionMcpHttp(request,{authenticate,authorizeDevice,readStatus}).then(response=>{
   if(response.status!==401)return response;
   const headers=new Headers(response.headers);
   headers.set('www-authenticate',`Bearer resource_metadata="${allowedOrigin}/.well-known/oauth-protected-resource/mcp/companion/v1"`);
   return new Response(response.body,{status:401,headers});
  });
 };
}
