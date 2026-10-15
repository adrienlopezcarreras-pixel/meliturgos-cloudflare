// Injectable, non-mounted MCP Streamable HTTP prototype. Does not authenticate itself.
// Deployment requires audited OAuth validator + owner-device authorization (injections).
export const MCP_HTTP_PATH='/mcp/companion/v1';
export const MCP_HTTP_PROTOCOL='2025-03-26';
const tool={name:'mel_companion_status',description:'Read the authorized Windows Companion status only',inputSchema:{type:'object',properties:{computer_id:{type:'string',maxLength:200}},additionalProperties:false}};
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','content-type':'application/json'};
const ALLOWED_PROTOCOLS=new Set(['2025-03-26']);
const REQUIRED_AUDIENCE='mel-companion-mcp';
const REQUIRED_SCOPE='companion:status:read';
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});}
function rpc(id,result){return {jsonrpc:'2.0',id,result};}
function rpcError(id,code,message){return {jsonrpc:'2.0',id,error:{code,message}};}
function validArgs(a){return a===undefined||(a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).every(k=>k==='computer_id')&&(a.computer_id===undefined||(typeof a.computer_id==='string'&&a.computer_id.length<=200)));}
export async function companionMcpHttp(request,{authenticate,authorizeDevice,readStatus}={}){
 const url=new URL(request.url);
 if(url.pathname!==MCP_HTTP_PATH)return json({error:'NOT_FOUND'},404);
 // Never expose MCP unless all three independently reviewed services exist.
 if(typeof authenticate!=='function'||typeof authorizeDevice!=='function'||typeof readStatus!=='function')return json({error:'MCP_REMOTE_NOT_CONFIGURED'},503);
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405,{allow:'POST'});
 const type=(request.headers.get('content-type')||'').toLowerCase();
 if(!/^application\/json(?:\s*;|$)/.test(type))return json({error:'JSON_REQUIRED'},415);
 // Streamable HTTP clients must advertise both JSON and SSE when sending Accept.
 const accept=request.headers.get('accept');
 if(accept&&!((accept.includes('application/json')||accept.includes('*/*'))&&(accept.includes('text/event-stream')||accept.includes('*/*'))))return json({error:'MCP_ACCEPT_UNSUPPORTED'},406);
 const protocol=request.headers.get('mcp-protocol-version');
 if(protocol&&!ALLOWED_PROTOCOLS.has(protocol))return json({error:'MCP_PROTOCOL_UNSUPPORTED'},400);
 if(Number(request.headers.get('content-length')||0)>16384)return json({error:'REQUEST_TOO_LARGE'},413);
 let principal;
 try{principal=await authenticate(request);}
 catch{return json({error:'AUTH_REQUIRED'},401,{'www-authenticate':'Bearer'});}
 if(!principal||typeof principal.subject!=='string'||!principal.subject.trim())return json({error:'AUTH_REQUIRED'},401,{'www-authenticate':'Bearer'});
 // authenticate() must validate JWT signature, issuer, expiry and revocation.
 // This boundary independently requires dedicated MCP audience and least-privilege scope.
 const audiences=Array.isArray(principal.audience)?principal.audience:[principal.audience];
 const scopes=Array.isArray(principal.scopes)?principal.scopes:String(principal.scope||'').split(/\s+/);
 if(!audiences.includes(REQUIRED_AUDIENCE)||!scopes.includes(REQUIRED_SCOPE))return json({error:'MCP_SCOPE_DENIED'},403);
 let body;
 try{const raw=await request.text();if(raw.length>16384)return json({error:'REQUEST_TOO_LARGE'},413);body=JSON.parse(raw);}
 catch{return json(rpcError(null,-32700,'Parse error'),400);}
 if(!body||body.jsonrpc!=='2.0'||typeof body.method!=='string'||Array.isArray(body))return json(rpcError(body?.id??null,-32600,'Invalid Request'),400);
 if(body.id!==undefined && !(typeof body.id==='string'&&body.id.length<=128||typeof body.id==='number'&&Number.isSafeInteger(body.id)))return json(rpcError(null,-32600,'Invalid Request id'),400);
 if(body.id===undefined){
  // Only the MCP initialization acknowledgement is permitted as a notification.
  if(body.method==='notifications/initialized')return new Response(null,{status:202,headers});
  return json(rpcError(null,-32600,'Unsupported notification'),400);
 }
 if(body.method==='initialize'){
  const requested=body.params?.protocolVersion;
  if(requested!==undefined&&(typeof requested!=='string'||!ALLOWED_PROTOCOLS.has(requested)))return json(rpcError(body.id,-32602,'Unsupported protocol version'),400);
  return json(rpc(body.id,{protocolVersion:MCP_HTTP_PROTOCOL,capabilities:{tools:{}},serverInfo:{name:'mel-companion-remote-preview',version:'0.1.0'}}));
 }
 if(body.method==='ping')return json(rpc(body.id,{}));
 if(body.method==='tools/list')return json(rpc(body.id,{tools:[tool]}));
 if(body.method!=='tools/call')return json(rpcError(body.id,-32601,'Method not found'));
 if(body.params?.name!==tool.name||!validArgs(body.params?.arguments))return json(rpcError(body.id,-32602,'Invalid tool arguments'));
 const id=body.params?.arguments?.computer_id;
 if(typeof id!=='string'||!id.trim())return json(rpcError(body.id,-32602,'computer_id required'));
 let allowed=false;
 try{allowed=await authorizeDevice(principal,id);}
 catch{return json({error:'AUTHZ_UNAVAILABLE'},503);}
 if(allowed!==true)return json({error:'DEVICE_FORBIDDEN'},403);
 try{
  const state=await readStatus(principal,id);
  if(!state||state.id!==id||typeof state.online!=='boolean')throw Error('BAD_STATUS');
  const safe={id,online:state.online,halted:state.halted===true,last_seen_at:Number(state.last_seen_at||0)};
  return json(rpc(body.id,{content:[{type:'text',text:JSON.stringify(safe)}]}));
 }catch{return json(rpc(body.id,{isError:true,content:[{type:'text',text:'COMPANION_STATUS_UNAVAILABLE'}]}));}
}
