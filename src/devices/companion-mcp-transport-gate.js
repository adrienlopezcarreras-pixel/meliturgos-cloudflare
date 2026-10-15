// Preview-only security gate for remote MCP transport.
// No production route is registered by this module.
export function checkCompanionMcpTransport(request,{allowedOrigin}={}){
 const url=new URL(request.url);
 if(url.protocol!=='https:')return {ok:false,status:403,code:'MCP_HTTPS_REQUIRED'};
 if(typeof allowedOrigin!=='string'||!allowedOrigin.startsWith('https://'))return {ok:false,status:503,code:'MCP_ORIGIN_NOT_CONFIGURED'};
 if(url.origin!==allowedOrigin)return {ok:false,status:403,code:'MCP_ORIGIN_NOT_ALLOWED'};
 const origin=request.headers.get('origin');
 if(origin&&origin!==allowedOrigin)return {ok:false,status:403,code:'MCP_CROSS_ORIGIN_DENIED'};
 return {ok:true};
}
