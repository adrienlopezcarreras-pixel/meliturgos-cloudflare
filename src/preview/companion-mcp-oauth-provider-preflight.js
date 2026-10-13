// No deployment. Review-only validator for OAuth issuer metadata.
export function validateCompanionAuthorizationServerMetadata(metadata,{issuer}={}){
 if(typeof issuer!=='string'||!issuer.startsWith('https://')||metadata?.issuer!==issuer)throw Error('MCP_ISSUER_MISMATCH');
 for(const key of ['authorization_endpoint','token_endpoint','jwks_uri']){
  const value=metadata?.[key];
  if(typeof value!=='string'||!value.startsWith('https://'))throw Error('MCP_OAUTH_ENDPOINT_INVALID');
 }
 if(!Array.isArray(metadata.grant_types_supported)||!metadata.grant_types_supported.includes('authorization_code'))throw Error('MCP_OAUTH_GRANT_REQUIRED');
 const methods=metadata.code_challenge_methods_supported;
 if(!Array.isArray(methods)||!methods.includes('S256'))throw Error('MCP_OAUTH_PKCE_REQUIRED');
 if(!Array.isArray(metadata.response_types_supported)||!metadata.response_types_supported.includes('code'))throw Error('MCP_OAUTH_CODE_FLOW_REQUIRED');
 return {issuer,authorization_endpoint:metadata.authorization_endpoint,token_endpoint:metadata.token_endpoint,jwks_uri:metadata.jwks_uri,pkce:'S256'};
}
