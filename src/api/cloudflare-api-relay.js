import { authorizeGitHubActionsOidcRequest } from '../security/github-actions-oidc.js';
import { D1CloudflareApiRelayStore } from '../platform/cloudflare-api-relay.js';

export function cloudflareApiRelay(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/internal/cloudflare-api-relay/')) return null;
  return (async () => {
    const auth = await authorizeGitHubActionsOidcRequest(request, env, {
      allowedWorkflows: ['cloudflare-api-relay.yml'],
      allowedEvents: ['workflow_run','workflow_dispatch','schedule'],
    });
    if (!auth.ok) return Response.json({ok:false,code:auth.code||'CLOUDFLARE_RELAY_AUTH_REQUIRED'},{status:auth.status||401,headers:{'cache-control':'no-store'}});
    if (!env?.DB) return Response.json({ok:false,code:'CLOUDFLARE_RELAY_DB_REQUIRED'},{status:503});
    const store=new D1CloudflareApiRelayStore(env.DB);
    const body=await request.json().catch(()=>({}));
    if(url.pathname==='/api/internal/cloudflare-api-relay/heartbeat'&&request.method==='POST'){
      const health=await store.heartbeat({metadata:{run_id:Number(body?.run_id||auth.identity?.run_id||0)||null,repository:String(auth.identity?.repository||'').slice(0,200)}});
      return Response.json({ok:true,relay:'cloudflare-api',health},{headers:{'cache-control':'no-store'}});
    }
    if(url.pathname==='/api/internal/cloudflare-api-relay/claim'&&request.method==='POST'){
      return Response.json({ok:true,job:await store.claim()},{headers:{'cache-control':'no-store'}});
    }
    if(url.pathname==='/api/internal/cloudflare-api-relay/result'&&request.method==='POST'){
      return Response.json({ok:true,job:await store.complete(body?.job_id,{status:body?.status,result:body?.result||null,error:body?.error||null})},{headers:{'cache-control':'no-store'}});
    }
    return Response.json({ok:false,code:'NOT_FOUND'},{status:404});
  })().catch(error=>Response.json({ok:false,code:String(error?.code||error?.message||'CLOUDFLARE_RELAY_FAILED').slice(0,180)},{status:Number(error?.status||500)}));
}
