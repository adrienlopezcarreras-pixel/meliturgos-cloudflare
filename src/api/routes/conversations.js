import { createGen2Runtime } from '../../core/orchestrator/gen2-runtime.js';
import { requireValue } from '../../core/contracts.js';

function context(env) {
 return {owner:env.MELITURGOS_USER||'owner',permissions:env.CAPABILITY_PERMISSIONS||[],requestId:crypto.randomUUID()};
}

/** /api/conversations is public canonical REST; /api/gen2/* remains compatible. */
export async function conversationRoutes(request,env) {
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/conversations') && path!=='/api/v1/sync')return null;
 const runtime=createGen2Runtime({env}),ctx=context(env);
 if(path==='/api/v1/sync') {
  requireValue(request.method==='GET','METHOD_NOT_ALLOWED',405);
  const deviceId=url.searchParams.get('device_id'),conversationId=url.searchParams.get('conversation_id');
  requireValue(deviceId && conversationId,'MISSING_PARAMS');return Response.json(await runtime.bus.execute('device.sync',{deviceId,conversationId},ctx));
 }
 const match=path.match(/^\/api\/conversations(?:\/([^/]+))?(?:\/(messages))?$/);if(!match)return null;
 const id=match[1] && decodeURIComponent(match[1]);
 if(!id && request.method==='GET')return Response.json({conversations:await runtime.bus.execute('conversation.list',{},ctx)});
 if(!id && request.method==='POST') {const body=await request.json();requireValue(!body.title || typeof body.title==='string');return Response.json(await runtime.bus.execute('conversation.create',{title:String(body.title||'').slice(0,200)},ctx),{status:201});}
 requireValue(id,'METHOD_NOT_ALLOWED',405);
 const lookup=await runtime.bus.execute('conversation.get',{id},ctx),row=lookup.conversation;requireValue(row && (!row.owner || row.owner===env.MELITURGOS_USER),'CONVERSATION_NOT_FOUND',404);
 if(match[2]) {
  if(request.method==='GET') {const result=await runtime.bus.execute('conversation.messages.list',{conversationId:id},ctx);return Response.json({messages:result.messages});}
  if(request.method==='POST') {const body=await request.json();requireValue(typeof body.content==='string' && body.content.length>0 && body.content.length<=12000 && (!body.role || body.role==='user'),'INVALID_MESSAGE');return Response.json(await runtime.bus.execute('conversation.messages.add',{conversationId:id,content:body.content,deviceId:body.device_id||''},ctx),{status:201});}
 } else {
  if(request.method==='GET')return Response.json(row);
  if(request.method==='PATCH') {const body=await request.json();requireValue(typeof body.title==='string' && body.title.length<=200);return Response.json(await runtime.bus.execute('conversation.update',{id,title:body.title},ctx));}
  if(request.method==='DELETE')return Response.json(await runtime.bus.execute('conversation.archive',{id},ctx));
 }
 requireValue(false,'METHOD_NOT_ALLOWED',405);
}
