import { createConnector } from '../connectors/wordpress.js';
import { createWorkersAIAdapter } from '../augmentio/workers-ai-adapter.js';

const MODEL='@cf/zai-org/glm-4.7-flash';
const MAX_QUERY=1200;

function json(payload,status=200,extra={}) {
  return new Response(JSON.stringify(payload),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'access-control-allow-origin':'https://verite-interdite.fr',
      'vary':'Origin',
      ...extra,
    },
  });
}

function cleanQuery(value='') {
  return String(value||'').replace(/\s+/g,' ').trim().slice(0,MAX_QUERY);
}

export function publicWordPressChatCors(request) {
  const origin=String(request.headers.get('origin')||'');
  if(origin && origin!=='https://verite-interdite.fr') return json({ok:false,error:'PUBLIC_ORIGIN_FORBIDDEN'},403);
  return new Response(null,{
    status:204,
    headers:{
      'access-control-allow-origin':'https://verite-interdite.fr',
      'access-control-allow-methods':'POST, OPTIONS',
      'access-control-allow-headers':'content-type',
      'access-control-max-age':'86400',
      'vary':'Origin',
    },
  });
}

export async function handlePublicWordPressChat(request, env) {
  const origin=String(request.headers.get('origin')||'');
  if(origin && origin!=='https://verite-interdite.fr') return json({ok:false,error:'PUBLIC_ORIGIN_FORBIDDEN'},403);
  if(!env?.AI || typeof env.AI.run!=='function') return json({ok:false,error:'PUBLIC_AI_UNAVAILABLE'},503);

  let body;
  try{body=await request.json()}catch{return json({ok:false,error:'PUBLIC_CHAT_BODY_INVALID'},400)}
  const query=cleanQuery(body?.message);
  if(!query) return json({ok:false,error:'PUBLIC_CHAT_MESSAGE_REQUIRED'},400);

  const connector=createConnector({fetcher:fetch});
  let rows=[];
  try{
    rows=await connector.execute('wordpress.public.search',{query,per_page:8,locale:'fr-FR'});
  }catch(error){
    return json({ok:false,error:String(error?.code||error?.message||'WORDPRESS_PUBLIC_SEARCH_FAILED')},502);
  }

  const sources=rows.slice(0,8).map(row=>({
    id:Number(row?.id)||null,
    title:String(row?.title||'').slice(0,240),
    url:String(row?.url||'').slice(0,1000),
    subtype:String(row?.subtype||'').slice(0,80),
  })).filter(row=>row.title||row.url);

  const adapter=createWorkersAIAdapter({
    env,
    modelId:MODEL,
    id:'workers-ai:wordpress-public-chat',
    capabilities:['GENERAL'],
    priority:1,
    estimatedCost:0,
  });

  const system=[
    'Tu es MEL publique, assistante de Vérité Interdite.',
    'Tu n as accès qu aux résultats de recherche publics WordPress fournis ci-dessous.',
    'N utilise aucune mémoire privée, aucun profil propriétaire, aucun mail, aucun fichier personnel.',
    'Réponds en français, brièvement et utilement.',
    'N invente jamais le contenu d une source. Si les résultats ne suffisent pas, dis-le clairement.',
    'Quand une source semble pertinente, cite son titre et son URL.',
  ].join(' ');

  const result=await adapter.invoke({
    input:[
      {role:'system',content:system},
      {role:'user',content:`QUESTION:\n${query}\n\nRESULTATS_PUBLICS:\n${JSON.stringify(sources)}`},
    ],
    context:{inference_settings:{temperature:0.2,max_tokens:500}},
  });

  return json({
    ok:true,
    answer:result.text,
    sources,
    scope:'PUBLIC_ONLY',
    provider:result.provenance?.provider||'workers-ai',
    model:result.provenance?.model||MODEL,
  });
}
