#!/usr/bin/env node
// Local owner-launched MCP stdio adapter for MEL Companion.
// Intentionally read-only: no command dispatch, pairing, flash, exec or deploy.
import readline from 'node:readline';

const serverUrl=process.env.MEL_MCP_SERVER_URL;
const ownerToken=process.env.MEL_MCP_OWNER_TOKEN;
const validUrl=(()=>{
 try { const u=new URL(serverUrl); return u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname==='/'; }
 catch { return false; }
})();
const toolName='mel_companion_status';
const tool={
 name:toolName,
 description:'Read MEL Companion pairing, online, remote-access and recent command status. This does not operate the computer.',
 inputSchema:{type:'object',properties:{computer_id:{type:'string',maxLength:200}},additionalProperties:false}
};
function response(id,result){ process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n'); }
function error(id,code,message){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code,message}})+'\n');}
async function getStatus(args){
 if(!validUrl)throw new Error('MEL_MCP_SERVER_URL_MUST_BE_HTTPS_ORIGIN');
 if(!ownerToken)throw new Error('MEL_MCP_OWNER_TOKEN_NOT_SET');
 if(ownerToken.length>4096||/[\r\n]/.test(ownerToken))throw new Error('MEL_MCP_OWNER_TOKEN_INVALID');
 const u=new URL('/api/computer/v1/status',serverUrl);
 if(args.computer_id)u.searchParams.set('computer_id',args.computer_id);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const res=await fetch(u,{headers:{authorization:'Bearer '+ownerToken,accept:'application/json'},redirect:'error',signal:controller.signal});
  if(!res.ok)throw new Error('MEL_STATUS_HTTP_'+res.status);
  const mime=(res.headers.get('content-type')||'').toLowerCase();
  if(!mime.includes('application/json'))throw new Error('MEL_STATUS_NOT_JSON');
  if(Number(res.headers.get('content-length')||0)>1048576)throw new Error('MEL_STATUS_TOO_LARGE');
  const reader=res.body?.getReader();
  if(!reader)throw new Error('MEL_STATUS_INVALID');
  const chunks=[];let total=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.byteLength;
    if(total>1048576){await reader.cancel();throw new Error('MEL_STATUS_TOO_LARGE');}
    chunks.push(Buffer.from(value));
   }
  }finally{reader.releaseLock();}
  const raw=Buffer.concat(chunks,total).toString('utf8');
  let data;
  try{data=JSON.parse(raw);}catch{throw new Error('MEL_STATUS_INVALID_JSON');}
  if(data.ok!==true||!Array.isArray(data.devices))throw new Error('MEL_STATUS_INVALID');
  return {devices:data.devices.map(d=>({
   id:String(d.id||''),name:String(d.name||''),online:d.online===true,
   halted:d.halted===true,remote_access_enabled:d.metadata?.remote_access_enabled===true,
   last_seen_at:Number(d.last_seen_at||0),platform:String(d.platform||'')
  })),selected_id:data.selected_id||null,
   commands:(Array.isArray(data.commands)?data.commands:[]).slice(0,20).map(c=>({
    id:String(c.id||''),status:String(c.status||''),created_at:Number(c.created_at||0),
    finished_at:c.finished_at==null?null:Number(c.finished_at),error_code:c.error_code||null
   }))};
 }finally{clearTimeout(timeout);}
}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){
 if(line.length>16384){error(null,-32600,'Request too large');continue;}
 let msg;
 try{msg=JSON.parse(line);}catch{error(null,-32700,'Parse error');continue;}
 if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string'){error(msg?.id??null,-32600,'Invalid request');continue;}
 if(msg.id===undefined){
  // Notifications have no response, but must never execute tools.
  if(msg.method.startsWith('notifications/'))continue;
  error(null,-32600,'Invalid notification');continue;
 }
 if(msg.id!==null && typeof msg.id!=='string' && (typeof msg.id!=='number'||!Number.isFinite(msg.id))){error(null,-32600,'Invalid request id');continue;}
 if(msg.method==='initialize'){
  response(msg.id,{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'mel-companion-readonly',version:'0.1.0'}});
 }else if(msg.method==='ping'){response(msg.id,{});}
 else if(msg.method==='tools/list'){response(msg.id,{tools:[tool]});}
 else if(msg.method==='tools/call'){
  if(msg.params?.name!==toolName){error(msg.id,-32602,'Unknown tool');continue;}
  const args=msg.params?.arguments===undefined?{}:msg.params.arguments;
  if(args===null||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>k!=='computer_id')||(args.computer_id!==undefined&&(typeof args.computer_id!=='string'||(args.computer_id.length>200||/[\x00-\x1f\x7f]/.test(args.computer_id))))){
   error(msg.id,-32602,'Invalid arguments');continue;
  }
  try{const data=await getStatus(args);response(msg.id,{content:[{type:'text',text:JSON.stringify(data)}]});}
  catch(e){response(msg.id,{isError:true,content:[{type:'text',text:(e instanceof TypeError || e?.name==='AbortError')?'MEL_STATUS_UNAVAILABLE':String(e.message||'STATUS_FAILED')}]});}
 }else error(msg.id,-32601,'Method not found');
}
