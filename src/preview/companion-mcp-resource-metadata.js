// OAuth 2.0 Protected Resource Metadata (RFC 9728), preview only.
export function companionMcpProtectedResourceMetadata(request,env){
 const origin=String(env?.MCP_PREVIEW_ORIGIN||'');
 const issuer=String(env?.MCP_OAUTH_ISSUER||'');
 const url=new URL(request.url);
 if(!['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp/companion/v1'].includes(url.pathname))return null;
 if(request.method!=='GET')return new Response(null,{status:405,headers:{allow:'GET'}});
 if(!/^https:\/\/[^/]+$/.test(origin)||!/^https:\/\/[^/]+$/.test(issuer)||url.origin!==origin)
  return Response.json({error:'MCP_METADATA_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}});
 return Response.json({resource:origin+'/mcp/companion/v1',authorization_servers:[issuer],scopes_supported:['companion:status:read'],bearer_methods_supported:['header']},{headers:{'cache-control':'no-store','access-control-allow-origin':origin,'x-content-type-options':'nosniff'}});
}
