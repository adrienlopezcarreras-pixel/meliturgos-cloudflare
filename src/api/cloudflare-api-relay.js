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
    if(url.pathname==='/api/internal/cloudflare-api-relay/mini-status'&&request.method==='POST'){
      const rows=await env.DB.prepare(`SELECT t.device_id,t.model,t.last_seen_at,t.revoked_at,s.payload_json,s.updated_at
        FROM device_tokens t LEFT JOIN device_status s ON s.device_id=t.device_id
        ORDER BY t.last_seen_at DESC LIMIT 5`).all();
      const now=Date.now();
      const devices=(rows.results||[]).map(row=>{
        let status={};try{status=JSON.parse(row.payload_json||'{}')}catch{}
        return {
          device_id:String(row.device_id||'').slice(0,160),
          model:String(row.model||'').slice(0,160),
          last_seen_at:Number(row.last_seen_at||0)||null,
          status_updated_at:Number(row.updated_at||0)||null,
          online:row.revoked_at==null&&now-Number(row.last_seen_at||0)<30000,
          revoked:row.revoked_at!=null,
          status:{
            firmware:status.firmware?String(status.firmware).slice(0,80):null,
            protocol_version:status.protocol_version?String(status.protocol_version).slice(0,40):null,
            battery:Number.isFinite(Number(status.battery))?Number(status.battery):null,
            wifi_rssi:Number.isFinite(Number(status.wifi_rssi))?Number(status.wifi_rssi):null,
            free_heap:Number.isFinite(Number(status.free_heap))?Number(status.free_heap):null,
            uptime_ms:Number.isFinite(Number(status.uptime_ms))?Number(status.uptime_ms):null,
            camera:status.camera??null,
            microphone:status.microphone??null,
            speaker:status.speaker??null,
            internal_storage:status.internal_storage??null,
            storage_total_bytes:Number.isFinite(Number(status.storage_total_bytes))?Number(status.storage_total_bytes):null,
            storage_free_bytes:Number.isFinite(Number(status.storage_free_bytes))?Number(status.storage_free_bytes):null,
            phase:status.phase?String(status.phase).slice(0,80):null,
          },
        };
      });
      return Response.json({ok:true,relay:'cloudflare-api',devices},{headers:{'cache-control':'no-store'}});
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
