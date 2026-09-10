import { createConversationService } from '../../conversations/conversation-service.js';
import { requireValue } from '../../core/contracts.js';
import { MAX_CHAT_INPUT_CHARS } from '../../core/limits.js';

/** /api/conversations is public canonical REST; /api/gen2/* remains compatible. */
export async function conversationRoutes(request,env) {
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/conversations') && path!=='/api/v1/sync')return null;
 const service=createConversationService(env);await service.migrate();
 if(path==='/api/v1/sync') {
  requireValue(request.method==='GET','METHOD_NOT_ALLOWED',405);
  const deviceId=url.searchParams.get('device_id'),conversationId=url.searchParams.get('conversation_id');
  requireValue(deviceId && conversationId,'MISSING_PARAMS');return Response.json(await service.sync({deviceId,conversationId}));
 }
 const match=path.match(/^\/api\/conversations(?:\/([^/]+))?(?:\/(messages))?$/);if(!match)return null;
 const id=match[1] && decodeURIComponent(match[1]);
 if(!id && request.method==='GET')return Response.json({conversations:await service.list({owner:env.MELITURGOS_USER})});
 if(!id && request.method==='POST') {const body=await request.json();requireValue(!body.title || typeof body.title==='string');return Response.json(await service.create({owner:env.MELITURGOS_USER,title:String(body.title||'').slice(0,200)}),{status:201});}
 requireValue(id,'METHOD_NOT_ALLOWED',405);
 const row=await service.get({id});requireValue(row && (!row.owner || row.owner===env.MELITURGOS_USER),'CONVERSATION_NOT_FOUND',404);
 if(match[2]) {
  if(request.method==='GET')return Response.json({messages:await service.listMessages({conversationId:id})});
  if(request.method==='POST') {const body=await request.json();requireValue(typeof body.content==='string' && body.content.length>0 && body.content.length<=MAX_CHAT_INPUT_CHARS && (!body.role || body.role==='user'),'INVALID_MESSAGE');return Response.json(await service.addMessage({conversationId:id,content:body.content,role:'user',deviceId:body.device_id || null}),{status:201});}
 } else {
  if(request.method==='GET')return Response.json(row);
  if(request.method==='PATCH') {const body=await request.json();requireValue(typeof body.title==='string' && body.title.length<=200);return Response.json(await service.update({id,title:body.title}));}
  if(request.method==='DELETE')return Response.json(await service.archive({id}));
 }
 requireValue(false,'METHOD_NOT_ALLOWED',405);
}
