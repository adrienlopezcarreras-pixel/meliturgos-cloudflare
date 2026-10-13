// Explicitly configured OAuth issuer discovery; no deployment and no automatic key installation.
import {validateCompanionAuthorizationServerMetadata} from './companion-mcp-oauth-provider-preflight.js';
export async function discoverCompanionOAuthIssuer({issuer,fetcher=fetch}={}){
 if(typeof issuer!=='string'||!/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(issuer))throw Error('MCP_ISSUER_CONFIG_INVALID');
 const metadataUrl=new URL('/.well-known/oauth-authorization-server',issuer);
 const response=await fetcher(metadataUrl.toString(),{method:'GET',redirect:'manual',headers:{accept:'application/json'}});
 if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw Error('MCP_ISSUER_DISCOVERY_DENIED');
 const raw=await response.text();
 if(raw.length>16384)throw Error('MCP_ISSUER_METADATA_TOO_LARGE');
 const metadata=JSON.parse(raw);
 return validateCompanionAuthorizationServerMetadata(metadata,{issuer});
}
