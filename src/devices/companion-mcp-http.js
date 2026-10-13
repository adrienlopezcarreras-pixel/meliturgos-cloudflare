// Remote MCP HTTP transport: narrow protocol shell, deliberately disabled until OAuth gateway exists.
// This is a library, not a deployed route. No owner token, device control or API exposure.
export const MCP_HTTP_PATH='/mcp/companion/v1';
export const MCP_HTTP_PROTOCOL='2025-03-26';
export const MCP_HTTP_STATUS='AUTH_NOT_CONFIGURED';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export function companionMcpHttp(request,{authorize}={}){
 const url=new URL(request.url);
 if(url.pathname!==MCP_HTTP_PATH)return json({error:'NOT_FOUND'},404);
 if(typeof authorize!=='function')return json({error:MCP_HTTP_STATUS},503);
 // Fail closed even when a caller supplies a hypothetical authorization callback:
 // OAuth and per-user device binding must be implemented and reviewed before enabling tools.
 return json({error:'MCP_REMOTE_NOT_ENABLED'},503);
}
