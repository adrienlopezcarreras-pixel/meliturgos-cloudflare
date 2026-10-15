// Preview-only deployment guard. Requires explicit operator opt-in and isolated bindings.
// This module does not publish or register a route.
export function validateCompanionMcpPreviewEnv(env){
 if(env?.MCP_PREVIEW_ENABLED!=='true')throw Error('MCP_PREVIEW_DISABLED');
 if(env?.MCP_PREVIEW_ISOLATED!=='true')throw Error('MCP_PREVIEW_NOT_ISOLATED');
 if(env?.MCP_PREVIEW_D1_ISOLATED!=='true')throw Error('MCP_PREVIEW_D1_ISOLATION_UNVERIFIED');
 if(typeof env?.DB?.prepare!=='function')throw Error('MCP_PREVIEW_D1_REQUIRED');
 const origin=String(env.MCP_PREVIEW_ORIGIN||'');
 const issuer=String(env.MCP_OAUTH_ISSUER||'');
 if(/REPLACE|\.invalid(?:$|\/)/i.test(origin+' '+issuer))throw Error('MCP_PREVIEW_PLACEHOLDER_CONFIG');
 if(!/^https:\/\/[^/]+$/.test(origin)||!/^https:\/\/[^/]+$/.test(issuer))throw Error('MCP_PREVIEW_HTTPS_REQUIRED');
 return true;
}
